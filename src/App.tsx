import React, { useState, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:8002/api/analyze`
    : '/api/analyze';

interface Pattern {
    nome: string;
    categoria: string;
    confiabilidade: string;
    qualidade: string;
    estrelas: number;
    localizacao_preco: number;
    localizacao_contexto: string;
    volume_confirmacao: boolean;
    volume_ratio: number;
    relevancia: string;
    descricao_visual: string;
    por_que_importante: string;
}

interface RetestPattern {
    nome: string;
    onde_procurar: string;
    como_identificar: string;
    confirmacao_necessaria: string;
}

interface TradeSetup {
    status: string;
    operacao: string;
    direcao: string;
    emoji: string;
    ultimo_preco?: number;
    entrada: {
        preco: number;
        tipo: string;
    };
    stop_loss: {
        preco: number;
        perda_percentual: number;
        justificativa: string;
    };
    alvos: {
        nome: string;
        preco: number;
        ganho_percentual: number;
    }[];
    risco_recompensa: {
        alvo_1: string;
        alvo_2: string;
    };
    analise_detalhada: {
        tendencia: string;
        confianca: number;
        justificativa_completa: string;
        riscos: string[];
        invalidacao: string;
    };
    padroes_identificados: Pattern[];
    padroes_reteste: RetestPattern[];
    confluencias: {
        total: number;
        lista: string[];
        forca: string;
    };
    smart_money: {
        fase: string;
        posicionamento: string;
    };
}

export default function App() {
    const [image, setImage] = useState<string | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<TradeSetup | null>(null);
    const [status, setStatus] = useState('Aguardando gráfico...');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setImage(reader.result as string);
            analyzeChart(file);
        };
        reader.readAsDataURL(file);

        // Reset input value to allow selecting the same file again
        e.target.value = '';
    };

    const analyzeChart = async (file: File) => {
        setResult(null);
        setErrorMsg(null);
        setAnalyzing(true);
        setStatus('ANALISANDO GRÁFICO...');
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await axios.post(API_URL, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 60000 // 60s for slow IA
            });
            if (response.data.success) {
                setResult(response.data.setup);
            } else {
                setErrorMsg(response.data.message || 'Erro desconhecido na IA');
            }
        } catch (error: any) {
            setErrorMsg(error.response?.data?.detail || error.message || 'Erro de conexão com o servidor');
        } finally {
            setAnalyzing(false);
        }
    };

    return (
        <div className="min-h-screen">
            <div className="header">
                <div className="logo">ViewGain</div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button title="Galeria" className="camera-btn" onClick={() => fileInputRef.current?.click()}>📁</button>
                    <button title="Câmera" className="camera-btn" onClick={() => cameraInputRef.current?.click()}>📷</button>
                </div>
            </div>

            <div className="container">
                {!image ? (
                    <div className="main-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <div style={{ fontSize: '48px', marginBottom: '20px' }}>📊</div>
                        <div className="main-title" style={{ fontSize: '24px' }}>Analise seu Gráfico</div>
                        <div className="main-subtitle" style={{ marginBottom: '30px' }}>Escolha como enviar a imagem</div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <button
                                onClick={() => cameraInputRef.current?.click()}
                                className="action-button"
                                style={{ margin: 0, padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', justifyContent: 'center', backgroundColor: '#007AFF' }}
                            >
                                <span style={{ fontSize: '24px' }}>📷</span>
                                <span style={{ fontSize: '14px' }}>Tirar Foto</span>
                            </button>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="action-button"
                                style={{ margin: 0, padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', justifyContent: 'center', background: '#34C759' }}
                            >
                                <span style={{ fontSize: '24px' }}>📁</span>
                                <span style={{ fontSize: '14px' }}>Galeria</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <AnimatePresence mode="wait">
                        {analyzing ? (
                            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="main-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                                <div className="main-title" style={{ fontSize: '24px', letterSpacing: '1px' }}>🔍 {status}</div>
                                <div className="main-subtitle" style={{ marginTop: '10px' }}>O Gemini Pro está processando os padrões de price action...</div>
                                <div className="progress-bar" style={{ marginTop: '30px', height: '12px' }}>
                                    <motion.div
                                        className="progress-fill"
                                        animate={{ width: ['0%', '100%'] }}
                                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                                        style={{ backgroundColor: '#007AFF' }}
                                    />
                                </div>
                            </motion.div>
                        ) : errorMsg ? (
                            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <div className="invalid-card" style={{ padding: '24px', border: '2px solid #FF3B30' }}>
                                    <div className="invalid-icon" style={{ fontSize: '32px' }}>❌</div>
                                    <div>
                                        <div className="invalid-title" style={{ color: '#FF3B30' }}>Falha na Análise</div>
                                        <div className="invalid-text" style={{ fontSize: '16px', marginTop: '4px' }}>{errorMsg}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setImage(null); setErrorMsg(null); }}
                                    className="action-button"
                                    style={{ marginTop: '20px' }}
                                >
                                    🔄 Tentar Novamente
                                </button>
                            </motion.div>
                        ) : result && (
                            <motion.div key="result" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
                                {/* CARD PRINCIPAL */}
                                <div className="main-card">
                                    <div className="badge" style={{ backgroundColor: result.operacao === 'COMPRA' ? '#34C759' : '#FF3B30' }}>
                                        {result.operacao === 'COMPRA' ? '⬆ COMPRA' : '⬇ VENDA'}
                                    </div>
                                    <div className="main-title">{result.direcao}</div>
                                    <div className="main-subtitle">Confiança: {result.analise_detalhada?.confianca || 0}%</div>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: `${result.analise_detalhada?.confianca || 0}%`, backgroundColor: result.operacao === 'COMPRA' ? '#34C759' : '#FF3B30' }}></div>
                                    </div>
                                </div>

                                {/* PADRÕES IDENTIFICADOS */}
                                {result.padroes_identificados?.length > 0 && (
                                    <div style={{ marginBottom: '30px' }}>
                                        <div className="section-title">🎯 Padrões Identificados</div>
                                        {result.padroes_identificados.map((padrao, idx) => (
                                            <div key={idx} className="padrao-card" style={{ borderLeftColor: result.operacao === 'COMPRA' ? '#34C759' : '#FF3B30' }}>
                                                <div className="padrao-header">
                                                    <div className="padrao-nome">{idx + 1}. {padrao.nome}</div>
                                                    <div className="padrao-badges">
                                                        <div className="mini-badge">{padrao.categoria}</div>
                                                        <div className="estrelas">{'⭐'.repeat(padrao.estrelas || 1)}</div>
                                                    </div>
                                                </div>
                                                <span className="detalhe-item">📍 Localização: {padrao.localizacao_contexto}</span>
                                                <span className="detalhe-item">💰 Preço: {padrao.localizacao_preco}</span>
                                                <span className="detalhe-item">🎯 Qualidade: {padrao.qualidade}</span>
                                                {padrao.volume_confirmacao && (
                                                    <span className="detalhe-item">📊 Volume: {padrao.volume_ratio}x acima da média ✅</span>
                                                )}
                                                <div className="descricao-box">
                                                    <span className="descricao-label">Descrição Visual:</span>
                                                    <p className="descricao-texto">{padrao.descricao_visual}</p>
                                                </div>
                                                <div className="importancia-box" style={{ borderLeftColor: result.operacao === 'COMPRA' ? '#34C759' : '#FF3B30', backgroundColor: result.operacao === 'COMPRA' ? '#e1f5e6' : '#ffebee' }}>
                                                    <span className="descricao-label" style={{ color: result.operacao === 'COMPRA' ? '#1a3a1a' : '#c62828' }}>💡 Importância:</span>
                                                    <p className="descricao-texto">{padrao.por_que_importante}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* PADRÕES EM RETESTE */}
                                {result.padroes_reteste?.length > 0 && (
                                    <div style={{ marginBottom: '30px' }}>
                                        <div className="section-title">⏰ Confirmações no Reteste</div>
                                        {result.padroes_reteste.map((padrao, idx) => (
                                            <div key={idx} className="retest-card">
                                                <div className="retest-title">{padrao.nome}</div>
                                                <span className="detalhe-item">📍 Onde: {padrao.onde_procurar}</span>
                                                <span className="detalhe-item">👁️ Como identificar: {padrao.como_identificar}</span>
                                                <span className="detalhe-item" style={{ fontWeight: '700', marginTop: '4px' }}>✅ Confirmação: {padrao.confirmacao_necessaria}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* PREÇOS */}
                                <div className="price-grid">
                                    <div className="price-card">
                                        <div className="price-label">Entrada</div>
                                        <div className="price-value">{result.entrada?.preco || 0}</div>
                                        <div className="price-type">{result.entrada?.tipo || 'Limite'}</div>
                                    </div>

                                    <div className="price-card">
                                        <div className="price-label">Stop Loss</div>
                                        <div className="price-value red">{result.stop_loss?.preco || 0}</div>
                                        <div className="price-pct red">{result.stop_loss?.perda_percentual || 0}%</div>
                                    </div>

                                    <div className="price-card">
                                        <div className="price-label">Alvo 1</div>
                                        <div className="price-value green">{result.alvos?.[0]?.preco || 0}</div>
                                        <div className="price-pct green">+{result.alvos?.[0]?.ganho_percentual || 0}%</div>
                                    </div>

                                    <div className="price-card">
                                        <div className="price-label">Alvo 2</div>
                                        <div className="price-value green">{result.alvos?.[1]?.preco || 0}</div>
                                        <div className="price-pct green">+{result.alvos?.[1]?.ganho_percentual || 0}%</div>
                                    </div>
                                </div>

                                {/* R:R */}
                                <div className="rr-card" style={{ borderColor: result.operacao === 'COMPRA' ? '#34C759' : '#FF3B30' }}>
                                    <div className="rr-label">Risco / Recompensa</div>
                                    <div className="rr-value" style={{ color: result.operacao === 'COMPRA' ? '#34C759' : '#FF3B30' }}>{result.risco_recompensa?.alvo_2 || 'N/A'}</div>
                                </div>

                                {/* CONFLUÊNCIAS */}
                                {result.confluencias?.lista?.length > 0 && (
                                    <div style={{ marginBottom: '30px' }}>
                                        <div className="section-title">📊 Confluências ({result.confluencias.lista.length} fatores)</div>
                                        <div className="main-card" style={{ padding: '16px' }}>
                                            {result.confluencias.lista.map((item, idx) => (
                                                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '14px', color: '#48484a' }}>
                                                    <span>✅</span>
                                                    <span>{item}</span>
                                                </div>
                                            ))}
                                            <div style={{ marginTop: '12px', fontSize: '12px', fontWeight: '700', color: '#8E8E93', textTransform: 'uppercase' }}>
                                                Força Final: <span style={{ color: result.confluencias.forca === 'muito_alta' ? '#34C759' : '#007AFF' }}>{result.confluencias.forca?.replace('_', ' ') || 'MEDIA'}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* CONTEXTO */}
                                <div style={{ marginTop: '30px' }}>
                                    <div className="section-title">Smart Money Context</div>
                                    <div className="context-card">
                                        <div className="context-title">Contexto do Mercado</div>
                                        <div className="context-text">
                                            {result.smart_money?.fase || 'N/A'} • {result.smart_money?.posicionamento || 'N/A'}. {result.analise_detalhada?.justificativa_completa || ''}
                                        </div>
                                    </div>
                                </div>

                                {/* INVALIDAÇÃO */}
                                <div className="invalid-card">
                                    <div className="invalid-icon">⚠️</div>
                                    <div>
                                        <div className="invalid-title">Invalidação</div>
                                        <div className="invalid-text">{result.analise_detalhada?.invalidacao || 'N/A'}</div>
                                    </div>
                                </div>

                                {/* BOTÃO */}
                                <button
                                    onClick={() => { setImage(null); setResult(null); }}
                                    className="action-button"
                                >
                                    📷 Nova Análise
                                </button>

                                <div className="footer">ViewGain v3.0 • Institutional Terminal</div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </div>

            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />
        </div>
    );
}
