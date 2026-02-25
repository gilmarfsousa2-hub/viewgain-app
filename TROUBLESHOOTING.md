# 🔍 ViewGain Troubleshooting Guide

Guia rápido para entender e resolver erros de análise técnica.

### ⏱️ Tempo esgotado (Timeout)
**O que significa:** A análise demorou mais que 60 segundos e o servidor cancelou.
**💡 Soluções:**
- Tente enviar uma imagem com menos zoom ou menos detalhes.
- Verifique se sua conexão de internet está lenta.
- Tire uma nova foto menos pesada.

### 🚫 Limite de taxa (429 - Rate Limit)
**O que significa:** Muitas requisições enviadas em curto período para o Claude.
**💡 Soluções:**
- Aguarde 1 minuto para o limite resetar.
- O app tenta automaticamente o Gemini como reserva nesses casos.

### 💳 Créditos esgotados (402)
**O que significa:** O saldo na conta da Anthropic acabou.
**💡 Solução:**
- Recarregar em [console.anthropic.com](https://console.anthropic.com/settings/billing).

### ❌ Erro de Conexão
**O que significa:** O servidor do app não está sendo alcançado.
**💡 Soluções:**
- Verifique se o Vercel está em manutenção.
- Tente atualizar a página do navegador.

---
*Versão do Guia: 1.0 (Feb 2026)*
