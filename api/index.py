from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import base64
import json
import hashlib
import os
import logging
import time
from typing import Dict, List, Optional
from dotenv import load_dotenv
from google import genai
from google.genai import types
import anthropic
from PIL import Image
import io

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ViewGainBackend")
 
# Cache de resultados (No Vercel use /tmp/ para escrita)
CACHE_FILE = "/tmp/analysis_cache.json" if os.environ.get('VERCEL') else "analysis_cache.json"
ANALYSIS_CACHE = {}

def load_cache():
    global ANALYSIS_CACHE
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                ANALYSIS_CACHE = json.load(f)
            logger.info(f"Cache carregado: {len(ANALYSIS_CACHE)} entradas.")
        except Exception as e:
            logger.error(f"Erro ao carregar cache: {e}")
            ANALYSIS_CACHE = {}

def save_cache():
    try:
        with open(CACHE_FILE, 'w') as f:
            json.dump(ANALYSIS_CACHE, f)
    except Exception as e:
        logger.error(f"Erro ao salvar cache: {e}")

load_cache()
CACHE_EXPIRY = 86400 * 7 # 7 dias

def optimize_image(content: bytes, max_size_mb: float = 5.0) -> bytes:
    """Otimiza imagem se for maior que o limite configurado."""
    size_mb = len(content) / (1024 * 1024)
    if size_mb <= max_size_mb:
        return content
    
    logger.info(f"Otimizando imagem de {size_mb:.2f}MB...")
    try:
        img = Image.open(io.BytesIO(content))
        # Converter para RGB se necessário (remover alpha channel)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        
        # Redimensionar se for muito grande
        max_dim = 2000
        if max(img.width, img.height) > max_dim:
            ratio = max_dim / max(img.width, img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)
            
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        optimized_content = output.getvalue()
        logger.info(f"Imagem otimizada: {size_mb:.2f}MB -> {len(optimized_content)/(1024*1024):.2f}MB")
        return optimized_content
    except Exception as e:
        logger.error(f"Erro ao otimizar imagem: {e}")
        return content

app = FastAPI(title="ViewGain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_key = os.getenv("GEMINI_API_KEY", "").strip()
client = None
if api_key:
    client = genai.Client(api_key=api_key)
else:
    logger.warning("GEMINI_API_KEY not found.")

anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
anthropic_client = None
if anthropic_key:
    anthropic_client = anthropic.Anthropic(api_key=anthropic_key)
else:
    logger.warning("ANTHROPIC_API_KEY not found.")

# Modelos simplificados para evitar correntes longas de fallback que causam timeout no Vercel
MODELS_TO_TRY = [
    'gemini-2.0-flash',     # O mais rápido
    'gemini-1.5-flash',     # Fallback estável
]

PROMPT_ANALISE_PROFISSIONAL = """Analise este gráfico com MÁXIMA PRECISÃO de trader profissional (especialista em SMC e Price Action). 
Identifique padrões de candles, suportes, resistências e estruturas de mercado.

CRÍTICO: Você deve preencher TODOS os campos do JSON sem exceção. Nunca use "N/A" ou strings vazias.

Estrutura JSON esperada:
{
  "ultimo_preco": 0.0,
  "tendencia_atual": "ALTA|BAIXA|LATERAL",
  "padroes_identificados": [
    {
      "nome": "Ex: Breakout de Consolidação Inicial",
      "categoria": "ESTRUTURA|TENDENCIA|SMC|CANDLE",
      "confiabilidade": "ALTA|MEDIA|BAIXA",
      "qualidade": "FORTE|MEDIA|FRACA", 
      "estrelas": 1-5,
      "localizacao_preco": 0.0,
      "localizacao_contexto": "Ex: Rompimento da resistência em 39.28",
      "volume_confirmacao": true/false,
      "volume_ratio": 1.0,
      "relevancia": "ALTA|MEDIA|BAIXA",
      "descricao_visual": "Ex: Rompimento da linha de 'Máxima' com marubozu às 11:45",
      "por_que_importante": "Explicar a relevância estratégica em 2-3 linhas"
    }
  ],
  "padroes_aguardando_reteste": [
    {
      "nome": "Ex: Suporte de Flip",
      "onde_procurar": "Ex: Na região de 39.2823",
      "como_identificar": "Descreva as características visuais (ex: sombra longa, rejeição)",
      "confirmacao_necessaria": "Descreva os critérios (ex: volume acima da média)"
    }
  ],
  "setup": {
    "acao": "COMPRA|VENDA|AGUARDAR_RETESTE",
    "confianca": 1-100,
    "entrada": 0.0,
    "stop_loss": 0.0,
    "alvo_1": 0.0,
    "alvo_2": 0.0,
    "invalidacao": "Ex: Fechamento abaixo de 39.15",
    "contexto_smc": "Ex: Markup - AGUARDAR_RETESTE"
  }
}
"""

def calcular_setup_profissional(analise: Dict) -> Dict:
    setup_ia = analise.get('setup', {})
    preco_atual = analise.get('ultimo_preco', 0.0)
    estrategia = setup_ia.get('acao', 'AGUARDAR_RETESTE')
    entrada = setup_ia.get('entrada', preco_atual)
    stop = setup_ia.get('stop_loss', 0.0)
    alvo1 = setup_ia.get('alvo_1', 0.0)
    alvo2 = setup_ia.get('alvo_2', 0.0)
    
    risco_pontos = abs(entrada - stop) if stop > 0 and entrada > 0 else 0.0001
    risco_pct = round((risco_pontos / entrada) * 100, 2) if entrada > 0 else 0
    ganho1_pct = round((abs(alvo1 - entrada) / entrada) * 100, 2) if entrada > 0 else 0
    ganho2_pct = round((abs(alvo2 - entrada) / entrada) * 100, 2) if entrada > 0 else 0
    
    return {
        "status": "SETUP_PROFISSIONAL",
        "operacao": "COMPRA" if (alvo1 > entrada or "COMPRA" in estrategia) else "VENDA",
        "direcao": estrategia,
        "entrada": {"preco": entrada, "tipo": "Limite"},
        "stop_loss": {"preco": stop, "perda_percentual": risco_pct},
        "alvos": [
            {"nome": "Alvo 1", "preco": alvo1, "ganho_percentual": ganho1_pct},
            {"nome": "Alvo 2", "preco": alvo2, "ganho_percentual": ganho2_pct}
        ],
        "risco_recompensa": {"alvo_2": f"1:{round(ganho2_pct/risco_pct, 1)}" if risco_pct > 0 else "N/A"},
        "analise_detalhada": {
            "confianca": setup_ia.get('confianca', 0),
            "invalidacao": setup_ia.get('invalidacao', 'N/A')
        },
        "padroes_identificados": analise.get('padroes_identificados', []),
        "padroes_reteste": analise.get('padroes_aguardando_reteste', []),
        "confluencias": {"lista": [], "forca": "Alta"},
        "smart_money": {
            "fase": setup_ia.get('contexto_smc', "N/A"),
            "posicionamento": estrategia
        }
    }

@app.post("/api/analyze")
@app.post("/analyze")
async def analyze_chart(file: UploadFile = File(...)):
    start_time = time.time()
    if not client and not anthropic_client: 
        return {"success": False, "message": "Nenhuma API Key configurada."}
    
    content = await file.read()
    
    # 1. Otimizar Imagem
    optimized_content = optimize_image(content)
    
    # 2. Verificar Cache (usando hash da imagem otimizada para consistência)
    file_hash = hashlib.sha256(optimized_content).hexdigest()
    if file_hash in ANALYSIS_CACHE:
        cache_entry = ANALYSIS_CACHE[file_hash]
        if time.time() - cache_entry['timestamp'] < CACHE_EXPIRY:
            logger.info("Retornando resultado do cache.")
            return cache_entry['result']

    # 3. Tentar Claude com Retry e Backoff
    last_error = ""
    used_claude = False
    if anthropic_client:
        max_retries = 3
        for attempt in range(max_retries):
            try:
                used_claude = True
                wait_time = [0, 2, 5][attempt] if attempt < 3 else 0
                if wait_time > 0:
                    logger.info(f"Aguardando {wait_time}s antes da tentativa {attempt + 1}...")
                    time.sleep(wait_time)
                
                logger.info(f"Tentando Claude (Tentativa {attempt + 1}/3, Timeout 25s)...")
                base64_image = base64.b64encode(optimized_content).decode('utf-8')
                claude_prompt = f"{PROMPT_ANALISE_PROFISSIONAL}\nResponda APENAS o JSON."
                
                # Lista de modelos por ordem de preferência
                CLAUDE_MODELS = ["claude-3-5-sonnet-latest", "claude-3-5-sonnet-20240620", "claude-3-haiku-20240307"]
                
                message = None
                for model_id in CLAUDE_MODELS:
                    try:
                        logger.info(f"Testando modelo Claude: {model_id}")
                        message = anthropic_client.messages.create(
                            model=model_id,
                            max_tokens=2048,
                            timeout=25.0,
                            messages=[
                                {
                                    "role": "user",
                                    "content": [
                                        {
                                            "type": "image",
                                            "source": {
                                                "type": "base64",
                                                "media_type": "image/jpeg",
                                                "data": base64_image,
                                            },
                                        },
                                        {"type": "text", "text": claude_prompt}
                                    ],
                                }
                            ],
                        )
                        used_model = model_id
                        break # Sucesso com este modelo
                    except Exception as mod_err:
                        last_error = str(mod_err)
                        if "404" in last_error:
                            logger.warning(f"Modelo {model_id} não encontrado (404). Tentando próximo...")
                            continue
                        else:
                            raise mod_err # Outros erros (401, 429) tratados pelo try externo
                
                if not message:
                    raise Exception("Nenhum modelo Claude disponível na conta.")

                response_text = message.content[0].text
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0].strip()
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0].strip()
                    
                result = {
                    "success": True, 
                    "setup": calcular_setup_profissional(json.loads(response_text)),
                    "provider": f"Claude ({used_model})"
                }
                
                ANALYSIS_CACHE[file_hash] = {'timestamp': time.time(), 'result': result}
                save_cache()
                logger.info(f"Sucesso com Claude na tentativa {attempt + 1}")
                return result
                
            except Exception as e:
                last_error = str(e)
                logger.error(f"Erro Claude (Tentativa {attempt + 1}): {last_error}")
                
                # Se não for erro de cota ou timeout, para o retry do Claude e vai pro fallback
                if "429" not in last_error and "timeout" not in last_error.lower():
                    break

    # 4. Fallback para Gemini (Apenas se Claude falhou ou não existe)
    gemini_error = ""
    if client:
        try:
            # Puxamos apenas o mais rápido para o fallback final
            model_name = MODELS_TO_TRY[0]
            logger.info(f"Tentando Fallback: {model_name}...")
            response = client.models.generate_content(
                model=model_name,
                contents=[types.Part.from_bytes(data=optimized_content, mime_type="image/jpeg"), PROMPT_ANALISE_PROFISSIONAL],
                config=types.GenerateContentConfig(response_mime_type='application/json')
            )
            
            result = {
                "success": True, 
                "setup": calcular_setup_profissional(json.loads(response.text)),
                "provider": f"Gemini ({model_name}) - Fallback" if used_claude else f"Gemini ({model_name})"
            }
            
            ANALYSIS_CACHE[file_hash] = {'timestamp': time.time(), 'result': result}
            save_cache()
            return result
        except Exception as e:
            gemini_error = str(e)
            logger.error(f"Erro Fallback Gemini: {gemini_error}")

    # 5. Resposta Detalhada de Erro
    final_msg = "❌ Falha na Análise Técnica"
    if used_claude:
        if "429" in last_error:
            final_msg = "🚫 Claude: Limite de taxa (429). 💡 Solução: Aguarde 1 min."
        elif "timeout" in last_error.lower():
            final_msg = "⏱️ Claude: Tempo esgotado (Timeout). 💡 Solução: Tente imagem menor."
        elif "credit" in last_error.lower() or "402" in last_error:
            final_msg = "💳 Claude: Créditos esgotados. 💡 Solução: Recarregue a conta."
        else:
            final_msg = f"❌ Claude: {last_error[:100]}"
            
        if gemini_error:
            final_msg += f" | ⚠️ Gemini: {gemini_error[:50]}"
    else:
        final_msg = f"❌ Erro Gemini: {gemini_error[:100]}"
        
    return {"success": False, "message": final_msg}

@app.get("/")
def health_check(): 
    return {
        "status": "online", 
        "timestamp": time.time(),
        "cache_entries": len(ANALYSIS_CACHE)
    }

@app.get("/api/test-claude")
@app.get("/test-claude")
async def test_claude():
    if not anthropic_client: return {"success": False, "message": "Cliente não inicializado"}
    start = time.time()
    try:
        # Tenta os 3 principais modelos
        for model_id in ["claude-3-5-sonnet-latest", "claude-3-5-sonnet-20240620", "claude-3-haiku-20240307"]:
            try:
                msg = anthropic_client.messages.create(
                    model=model_id,
                    max_tokens=10,
                    messages=[{"role": "user", "content": "olá"}]
                )
                return {"success": True, "time": f"{time.time()-start:.2f}s", "model": model_id, "version": "3.6"}
            except Exception as e:
                if "404" in str(e): continue
                raise e
        return {"success": False, "message": "Nenhum modelo disponível nesta conta."}
    except Exception as e:
        return {"success": False, "error": str(e), "version": "3.6-failure"}

@app.get("/api/debug")
@app.get("/debug")
def debug_status():
    def mask_key(k):
        if not k: return None
        return f"{k[:4]}...{k[-4:]}"
    
    raw_anthropic = os.getenv("ANTHROPIC_API_KEY", "")
    stripped_anthropic = raw_anthropic.strip()
    
    return {
        "anthropic_key_present": bool(raw_anthropic),
        "anthropic_key_raw_mask": mask_key(raw_anthropic),
        "anthropic_key_stripped_mask": mask_key(stripped_anthropic),
        "anthropic_key_has_whitespace": raw_anthropic != stripped_anthropic,
        "gemini_key_present": bool(os.getenv("GEMINI_API_KEY")),
        "node_env": os.getenv("NODE_ENV"),
        "vercel_env": os.getenv("VERCEL_ENV"),
        "anthropic_client_initialized": anthropic_client is not None,
        "version": "3.6-multi-model"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
else:
    # Vercel entry point
    pass
