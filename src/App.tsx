import React, { useState, useRef, useEffect } from 'react';
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

interface HistoryItem {
    id: string;
    timestamp: number;
    image: string;
    result: any;
    provider: string | null;
}

// Componente Error Boundary para evitar tela branca total
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() { return { hasError: true }; }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '40px', textAlign: 'center', background: '#fff', minHeight: '100vh' }}>
                    <h2 style={{ color: '#FF3B30' }}>⚠️ Ops! Algo deu errado na renderização.</h2>
                    <p>Ocorreu um erro inesperado ao processar os dados.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px', margin: '20px auto' }}>
                        <button onClick={() => window.location.reload()} className="action-button" style={{ backgroundColor: '#007AFF' }}>Recarregar App</button>
                        <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="action-button" style={{ backgroundColor: '#8E8E93' }}>Limpar Cache Total</button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function App() {
    return (
        <ErrorBoundary>
            <ViewGainApp />
        </ErrorBoundary>
    );
}

function ViewGainApp() {
    const [image, setImage] = useState<string | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [status, setStatus] = useState('Aguardando gráfico...');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const [provider, setProvider] = useState<string | null>(null);
    const [history, setHistory] = useState<HistoryItem[]>([]);

    // Carregar histórico ao iniciar
    useEffect(() => {
        const savedHistory = localStorage.getItem('viewgain_history');
        if (savedHistory) {
            try {
                const parsed = JSON.parse(savedHistory);
                if (Array.isArray(parsed)) {
                    const validHistory = parsed.filter(item => item && item.result && item.image);
                    setHistory(validHistory);
                }
            } catch (e) {
                console.error("Erro ao carregar histórico", e);
                localStorage.removeItem('viewgain_history');
            }
        }
    }, []);

    // Salvar histórico sempre que mudar
    useEffect(() => {
        if (history.length > 0) {
            localStorage.setItem('viewgain_history', JSON.stringify(history));
        }
    }, [history]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Image = reader.result as string;
            setImage(base64Image);
            analyzeChart(file, base64Image);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const analyzeChart = async (file: File, base64Image: string) => {
        setResult(null);
        setProvider(null);
        setErrorMsg(null);
        setAnalyzing(true);
        setStatus('ANALISANDO GRÁFICO...');
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await axios.post(API_URL, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 90000
            });
            if (response.data.success) {
                const analysisResult = response.data.setup;
                const usedProvider = response.data.provider;
                setResult(analysisResult);
                setProvider(usedProvider);

                const newItem: HistoryItem = {
                    id: Date.now().toString(),
                    timestamp: Date.now(),
                    image: base64Image,
                    result: analysisResult,
                    provider: usedProvider
                };
                setHistory(prev => [newItem, ...prev].slice(0, 10));
            } else {
                setErrorMsg(response.data.message || 'Erro desconhecido na IA');
            }
        } catch (error: any) {
            if (error.code === 'ECONNABORTED') {
                setErrorMsg('⏱️ Tempo esgotado (Timeout). 💡 Tente uma imagem menor.');
            } else {
                setErrorMsg(error.response?.data?.message || error.response?.data?.detail || error.message || 'Erro de conexão');
            }
        } finally {
            setAnalyzing(false);
        }
    };

    const loadFromHistory = (item: HistoryItem) => {
        setImage(item.image);
        setResult(item.result);
        setProvider(item.provider);
        setErrorMsg(null);
        setAnalyzing(false);
    };

    const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setHistory(prev => prev.filter(item => item.id !== id));
    };

    return (
        <div className="min-h-screen">
            <div className="header">
                <div className="logo" onClick={() => { setImage(null); setResult(null); }} style={{ cursor: 'pointer' }}>ViewGain</div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button title="Galeria" className="camera-btn" onClick={() => fileInputRef.current?.click()}>📁</button>
                    <button title="Câmera" className="camera-btn" onClick={() => cameraInputRef.current?.click()}>📷</button>
                </div>
            </div>

            <div className="container">
                {!image ? (
                    <div className="main-card-container">
                        <div className="main-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📊</div>
                            <div className="main-title" style={{ fontSize: '24px' }}>Analise seu Gráfico</div>
                            <div className="main-subtitle" style={{ marginBottom: '30px' }}>Escolha como enviar a imagem</div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <button onClick={() => cameraInputRef.current?.click()} className="action-button" style={{ margin: 0, padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', justifyContent: 'center', backgroundColor: '#007AFF' }}>
                                    <span style={{ fontSize: '24px' }}>📷</span>
                                    <span style={{ fontSize: '14px' }}>Tirar Foto</span>
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="action-button" style={{ margin: 0, padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', justifyContent: 'center', background: '#34C759' }}>
                                    <span style={{ fontSize: '24px' }}>📁</span>
                                    <span style={{ fontSize: '14px' }}>Galeria</span>
                                </button>
                            </div>
                        </div>

                        {history.length > 0 && (
                            <div style={{ marginTop: '40px' }}>
                                <div className="section-title">🕒 Análises Recentes</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {history.map((item) => (
                                        <div key={item.id} onClick={() => loadFromHistory(item)} className="main-card" style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', border: '1px solid #e5e5ea', background: '#fcfcfd' }}>
                                            <div style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', background: '#eee', flexShrink: 0 }}>
                                                <img src={item.image} alt="Trade" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '14px', fontWeight: 'bold', color: item.result?.operacao === 'COMPRA' ? '#34C759' : '#FF3B30' }}>
                                                    {item.result?.operacao === 'COMPRA' ? '⬆ COMPRA' : '⬇ VENDA'} • {item.result?.analise_detalhada?.confianca || 0}%
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '2px' }}>
                                                    {new Date(item.timestamp).toLocaleString()}
                                                </div>
                                            </div>
                                            <button onClick={(e) => deleteHistoryItem(e, item.id)} style={{ background: 'none', border: 'none', color: '#FF3B30', padding: '10px', cursor: 'pointer', fontSize: '18px' }}>🗑️</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <AnimatePresence mode="wait">
                        {analyzing ? (
                            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="main-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                                <div className="main-title" style={{ fontSize: '24px', letterSpacing: '1px' }}>🔍 {status}</div>
                                <div className="main-subtitle" style={{ marginTop: '10px' }}>A IA está processando os padrões de price action...</div>
                                <div className="progress-bar" style={{ marginTop: '30px', height: '12px' }}>
                                    <motion.div className="progress-fill" animate={{ width: ['0%', '100%'] }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }} style={{ backgroundColor: '#007AFF' }} />
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
                                <button onClick={() => { setImage(null); setErrorMsg(null); }} className="action-button" style={{ marginTop: '20px' }}>🔄 Tentar Novamente</button>
                            </motion.div>
                        ) : result && (
                            <motion.div key="result" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
                                <div className="main-card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <div className="badge" style={{ margin: 0, backgroundColor: result?.operacao === 'COMPRA' ? '#34C759' : '#FF3B30' }}>
                                            {result?.operacao === 'COMPRA' ? '⬆ COMPRA' : '⬇ VENDA'}
                                        </div>
                                        {provider && <div style={{ fontSize: '10px', color: '#8E8E93', fontWeight: 'bold', textTransform: 'uppercase' }}>IA: {provider}</div>}
                                    </div>
                                    <div className="main-title">{result?.direcao || 'N/A'}</div>
                                    <div className="main-subtitle">Confiança: {result?.analise_detalhada?.confianca || 0}%</div>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: `${result?.analise_detalhada?.confianca || 0}%`, backgroundColor: result?.operacao === 'COMPRA' ? '#34C759' : '#FF3B30' }}></div>
                                    </div>
                                </div>

                                {result?.padroes_identificados?.length > 0 && (
                                    <div style={{ marginBottom: '30px' }}>
                                        <div className="section-title">🎯 Padrões Identificados</div>
                                        {result.padroes_identificados.map((padrao: any, idx: number) => (
                                            <div key={idx} className="padrao-card" style={{ borderLeftColor: result?.operacao === 'COMPRA' ? '#34C759' : '#FF3B30' }}>
                                                <div className="padrao-header">
                                                    <div className="padrao-nome">{idx + 1}. {padrao?.nome || 'Padrão'}</div>
                                                    <div className="padrao-badges">
                                                        <div className="mini-badge">{padrao?.categoria || 'SMC'}</div>
                                                        <div className="estrelas">{'⭐'.repeat(Math.max(0, Math.min(5, parseInt(padrao?.estrelas || 1))))}</div>
                                                    </div>
                                                </div>
                                                <span className="detalhe-item">📍 Localização: {padrao?.localizacao_contexto || 'N/A'}</span>
                                                <span className="detalhe-item">💰 Preço: {padrao?.localizacao_preco || 'N/A'}</span>
                                                <span className="detalhe-item">🎯 Qualidade: {padrao?.qualidade || 'ALTA'}</span>
                                                {padrao?.volume_confirmacao && (
                                                    <span className="detalhe-item">📊 Volume: {padrao?.volume_ratio || 1}x acima da média ✅</span>
                                                )}
                                                <div className="descricao-box">
                                                    <span className="descricao-label">Descrição Visual:</span>
                                                    <p className="descricao-texto">{padrao?.descricao_visual || 'N/A'}</p>
                                                </div>
                                                <div className="importancia-box" style={{ borderLeftColor: result?.operacao === 'COMPRA' ? '#34C759' : '#FF3B30', backgroundColor: result?.operacao === 'COMPRA' ? '#e1f5e6' : '#ffebee' }}>
                                                    <span className="descricao-label" style={{ color: result?.operacao === 'COMPRA' ? '#1a3a1a' : '#c62828' }}>💡 Importância:</span>
                                                    <p className="descricao-texto">{padrao?.por_que_importante || 'N/A'}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {result?.padroes_reteste?.length > 0 && (
                                    <div style={{ marginBottom: '30px' }}>
                                        <div className="section-title">⏰ Confirmações no Reteste</div>
                                        {result.padroes_reteste.map((padrao: any, idx: number) => (
                                            <div key={idx} className="retest-card">
                                                <div className="retest-title">{padrao?.nome || 'Alvos de Reteste'}</div>
                                                <span className="detalhe-item">📍 Onde: {padrao?.onde_procurar || 'N/A'}</span>
                                                <span className="detalhe-item">👁️ Como identificar: {padrao?.como_identificar || 'N/A'}</span>
                                                <span className="detalhe-item" style={{ fontWeight: '700', marginTop: '4px' }}>✅ Confirmação: {padrao?.confirmacao_necessaria || 'N/A'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="price-grid">
                                    <div className="price-card">
                                        <div className="price-label">Entrada</div>
                                        <div className="price-value">{result?.entrada?.preco || 0}</div>
                                        <div className="price-type">{result?.entrada?.tipo || 'Limite'}</div>
                                    </div>
                                    <div className="price-card">
                                        <div className="price-label">Stop Loss</div>
                                        <div className="price-value red">{result?.stop_loss?.preco || 0}</div>
                                        <div className="price-pct red">{result?.stop_loss?.perda_percentual || 0}%</div>
                                    </div>
                                    <div className="price-card">
                                        <div className="price-label">Alvo 1</div>
                                        <div className="price-value green">{result?.alvos?.[0]?.preco || 0}</div>
                                        <div className="price-pct green">+{result?.alvos?.[0]?.ganho_percentual || 0}%</div>
                                    </div>
                                    <div className="price-card">
                                        <div className="price-label">Alvo 2</div>
                                        <div className="price-value green">{result?.alvos?.[1]?.preco || 0}</div>
                                        <div className="price-pct green">+{result?.alvos?.[1]?.ganho_percentual || 0}%</div>
                                    </div>
                                </div>

                                <div className="rr-card" style={{ borderColor: result?.operacao === 'COMPRA' ? '#34C759' : '#FF3B30' }}>
                                    <div className="rr-label">Risco / Recompensa</div>
                                    <div className="rr-value" style={{ color: result?.operacao === 'COMPRA' ? '#34C759' : '#FF3B30' }}>{result?.risco_recompensa?.alvo_2 || 'N/A'}</div>
                                </div>

                                {result?.confluencias?.lista?.length > 0 && (
                                    <div style={{ marginBottom: '30px' }}>
                                        <div className="section-title">📊 Confluências ({result.confluencias.lista.length} fatores)</div>
                                        <div className="main-card" style={{ padding: '16px' }}>
                                            {result.confluencias.lista.map((item: any, idx: number) => (
                                                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '14px', color: '#48484a' }}>
                                                    <span>✅</span><span>{item}</span>
                                                </div>
                                            ))}
                                            <div style={{ marginTop: '12px', fontSize: '12px', fontWeight: '700', color: '#8E8E93', textTransform: 'uppercase' }}>
                                                Força : <span style={{ color: result?.confluencias?.forca === 'muito_alta' ? '#34C759' : '#007AFF' }}>{(result?.confluencias?.forca || 'MEDIA').replace('_', ' ')}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="context-card">
                                    <div className="context-title">Smart Money Context</div>
                                    <div className="context-text">
                                        {result?.smart_money?.fase || 'N/A'} • {result?.smart_money?.posicionamento || 'N/A'}. {result?.analise_detalhada?.justificativa_completa || ''}
                                    </div>
                                </div>

                                <div className="invalid-card">
                                    <div className="invalid-icon">⚠️</div>
                                    <div>
                                        <div className="invalid-title">Invalidação</div>
                                        <div className="invalid-text">{result?.analise_detalhada?.invalidacao || 'N/A'}</div>
                                    </div>
                                </div>

                                <button onClick={() => { setImage(null); setResult(null); }} className="action-button">📷 Nova Análise</button>
                                <div className="footer">ViewGain v3.7 • Institutional Terminal</div>
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
