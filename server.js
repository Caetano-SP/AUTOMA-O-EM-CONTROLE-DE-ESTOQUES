const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./database'); // <-- ADICIONE ESTA LINHA AQUI!
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configurações
app.use(compression({
    level: 6, // Nível equilibrado de compressão
    threshold: 10 * 1024, // Comprime apenas o que for maior que 10KB
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Compartilha o Socket.io com as rotas
app.set('io', io);

// Importação dos Módulos (Feature-Driven)
const authModule = require('./modules/auth/auth.routes');
const usersModule = require('./modules/users/users.routes');
const auditModule = require('./modules/audit/audit.routes');
const productsModule = require('./modules/products/products.routes');
const ordersModule = require('./modules/orders/orders.routes');

// Importação das Rotas Antigas
const purchaseRoutes = require('./routes/purchases');
const productionRoutes = require('./routes/production.js');

app.use('/api/auth', authModule);
app.use('/api/users', usersModule);
app.use('/api/audit', auditModule);
app.use('/api/products', productsModule);
app.use('/api/orders', ordersModule);

app.use('/api/purchases', purchaseRoutes);
app.use('/api/production', productionRoutes);

// Gerenciamento de conexões em tempo real
io.on('connection', (socket) => {
    console.log('📱 Novo dispositivo conectado ao estoque');
});

// ==========================================
// AUTOMAÇÕES CORPORATIVAS (ROBÔS)
// ==========================================
// 1. IMPORTAÇÃO DOS MÓDULOS (Tem que vir antes de tudo)
const cron = require('node-cron');
const fs = require('fs');
const zlib = require('zlib');

// 2. CONFIGURAÇÕES DO TELEGRAM
const TELEGRAM_TOKEN = "7892607179:AAGyecJn3lrni9CPvL9fgZVJDkdtb-OwtGA"; 
const CHAT_ID = "7330347465"; // <-- Substitua pelo ID que você encontrou

// ==========================================
// ROBÔ 1: ALERTA DE ESTOQUE CRÍTICO NO TELEGRAM
// ==========================================
// Roda todo dia às 08:00 ('0 8 * * *')
cron.schedule('0 8 * * *', () => {
    console.log('🕵️ Checando estoque para envio de alerta no Telegram...');
    
    // Tratamos exceções no db.all
    try {
        db.all("SELECT name, sku, current_stock, min_stock FROM products WHERE current_stock < min_stock", [], async (err, produtos) => {
            if (err) {
                console.error("Erro ao rodar query de alerta no SQLite:", err);
                return;
            }
            if (!produtos || produtos.length === 0) return; 

            let mensagem = "🚨 *ALERTA DE ESTOQUE CRÍTICO 360VIRTU* 🚨\n\n";
            mensagem += "Os seguintes itens estão abaixo do mínimo:\n\n";
            
            produtos.forEach(p => {
                mensagem += `📦 *${p.sku}* - ${p.name}\n`;
                mensagem += `Físico: ${p.current_stock} un | Mínimo: ${p.min_stock} un\n\n`;
            });
            
            mensagem += "⚠️ _Acesse o sistema e providencie a reposição._";

            try {
                await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: CHAT_ID, text: mensagem, parse_mode: 'Markdown' })
                });
            } catch (errReq) {
                console.error("Erro crítico ao tentar conectar API do Telegram:", errReq);
            }
        });
    } catch (e) {
        console.error("Erro geral no job do Telegram:", e);
    }
});

// ==========================================
// ROBÔ 2: BACKUP AUTOMÁTICO DO BANCO DE DADOS (COMPRESSO E INTELIGENTE)
// ==========================================
// Roda apenas de Segunda a Sexta (1-5) às 16:00
cron.schedule('0 16 * * 1-5', async () => {
    console.log('🤖 Iniciando rotina inteligente de Backup das 16h...');
    
    const dataObj = new Date();
    // Força fuso horário do Brasil para a verificação do dia
    const offsetDate = new Date(dataObj.getTime() - (3 * 60 * 60 * 1000));
    const dataHoje = offsetDate.toISOString().split('T')[0];
    const anoAtual = offsetDate.getFullYear();

    try {
        // Validação de Feriado Nacional via BrasilAPI
        const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${anoAtual}`);
        if (res.ok) {
            const feriados = await res.json();
            const ehFeriado = feriados.some(f => f.date === dataHoje);
            if (ehFeriado) {
                console.log(`🏖️ Hoje é feriado nacional. Backup abortado (economia de recursos da VPS).`);
                return; // Aborta o backup
            }
        }
    } catch (e) {
        console.warn('⚠️ Falha ao verificar feriados na BrasilAPI. Procedendo com o backup por precaução.');
    }

    const bancoAtual = path.join(__dirname, '../database.sqlite');
    const pastaBackup = path.join(__dirname, '../backups');
    
    if (!fs.existsSync(pastaBackup)) fs.mkdirSync(pastaBackup);
    
    // O arquivo agora será compactado como .gz
    const nomeBackup = `backup_${dataHoje}_16h.sqlite.gz`;
    const arquivoDestino = path.join(pastaBackup, nomeBackup);

    // Motor de Compressão GZIP em Streaming (Pesa quase nada na RAM da VPS)
    const readStream = fs.createReadStream(bancoAtual);
    const writeStream = fs.createWriteStream(arquivoDestino);
    const gzip = zlib.createGzip();

    readStream.pipe(gzip).pipe(writeStream)
        .on('finish', () => console.log(`✅ Backup GZIP gerado com sucesso: ${nomeBackup}`))
        .on('error', (err) => console.error('❌ Erro crítico ao compactar o backup:', err));
});

// ==========================================
// LIGANDO O SERVIDOR
// ==========================================
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`
    ==========================================
    🚀 360VIRTU STOCK - SISTEMA ONLINE
    PORTA: ${PORT}
    ESTADO: PRONTO PARA OPERAÇÃO
    ==========================================
    `);
});