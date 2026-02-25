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
CACHE_EXPIRY = 86400 * 7 # 7 dias (análise técnica de gráfico estático não muda)

app = FastAPI(title="ViewGain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_key = os.getenv("GEMINI_API_KEY")
client = None
if api_key:
    client = genai.Client(api_key=api_key)
else:
    logger.warning("GEMINI_API_KEY not found.")

anthropic_key = os.getenv("ANTHROPIC_API_KEY")
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
        return {"success": False, "message": "Nenhuma API Key (Claude ou Gemini) configurada."}
    
    content = await file.read()
    
    # 1. Verificar Cache
    file_hash = hashlib.sha256(content).hexdigest()
    if file_hash in ANALYSIS_CACHE:
        cache_entry = ANALYSIS_CACHE[file_hash]
        if time.time() - cache_entry['timestamp'] < CACHE_EXPIRY:
            logger.info("Retornando resultado do cache.")
            return cache_entry['result']

    # 2. Tentar Claude primeiro (se configurado)
    last_error = ""
    used_claude = False
    if anthropic_client:
        try:
            used_claude = True
            logger.info("Tentando Claude 3.5 Sonnet (Timeout 12s)...")
            base64_image = base64.b64encode(content).decode('utf-8')
            
            # Claude exige um prompt bem específico para JSON
            claude_prompt = f"{PROMPT_ANALISE_PROFISSIONAL}\nResponda APENAS o JSON, sem nenhum texto antes ou depois."
            
            message = anthropic_client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=2048,
                timeout=12.0, # Limite agressivo para não estourar o Vercel
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": file.content_type,
                                    "data": base64_image,
                                },
                            },
                            {"type": "text", "text": claude_prompt}
                        ],
                    }
                ],
            )
            
            response_text = message.content[0].text
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()
                
            result = {
                "success": True, 
                "setup": calcular_setup_profissional(json.loads(response_text)),
                "provider": "Claude 3.5 Sonnet"
            }
            
            ANALYSIS_CACHE[file_hash] = {'timestamp': time.time(), 'result': result}
            save_cache()
            logger.info(f"Análise Claude concluída em {time.time() - start_time:.2f}s")
            return result
            
        except Exception as e:
            last_error = f"Claude error: {str(e)}"
            logger.error(last_error)

    # 3. Tentar Gemini como fallback (Apenas modelos essenciais se Claude falhou ou não existe)
    # Se já tentamos o Claude e deu erro, tentamos APENAS o Gemini mais rápido para evitar timeout acumulado
    models_to_run = [MODELS_TO_TRY[0]] if used_claude else MODELS_TO_TRY
    
    for model_name in models_to_run:
        if not client: break
        try:
            logger.info(f"Tentando {model_name} (Fallback)...")
            response = client.models.generate_content(
                model=model_name,
                contents=[types.Part.from_bytes(data=content, mime_type=file.content_type), PROMPT_ANALISE_PROFISSIONAL],
                config=types.GenerateContentConfig(response_mime_type='application/json')
            )
            
            result = {
                "success": True, 
                "setup": calcular_setup_profissional(json.loads(response.text)),
                "provider": f"Gemini ({model_name}) - Fallback" if used_claude else f"Gemini ({model_name})"
            }
            
            ANALYSIS_CACHE[file_hash] = {'timestamp': time.time(), 'result': result}
            save_cache()
            logger.info(f"Análise Gemini concluída em {time.time() - start_time:.2f}s")
            return result
        except Exception as e:
            last_error = str(e)
            logger.error(f"Erro com {model_name}: {last_error}")
            if "429" in last_error: continue # Tenta o próximo se existir
            break # Erros críticos param aqui

    msg = "Cota Esgotada ou Timeout. Tente novamente." if "429" in last_error else f"Erro: {last_error}"
    return {"success": False, "message": msg}

@app.get("/")
def health_check(): return {"status": "online", "version": "3.1-debug"}

@app.get("/api/debug")
@app.get("/debug")
def debug_status():
    return {
        "anthropic_key_present": bool(os.getenv("ANTHROPIC_API_KEY")),
        "gemini_key_present": bool(os.getenv("GEMINI_API_KEY")),
        "node_env": os.getenv("NODE_ENV"),
        "vercel_env": os.getenv("VERCEL_ENV"),
        "anthropic_client_initialized": anthropic_client is not None,
        "gemini_client_initialized": client is not None
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
else:
    # Vercel entry point
    pass
