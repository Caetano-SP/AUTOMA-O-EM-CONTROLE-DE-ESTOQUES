const express = require('express');
const cors = require('cors');
const os = require('os');
const path = require('path');

const app = express();
const PORT = 3000;

// Configurações básicas
app.use(cors()); // Permite que o frontend converse com o backend
app.use(express.json()); // Permite receber dados em JSON

// Deixa a pasta uploads pública para exibir as imagens na rede local
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
// Expor a interface visual (Frontend)
app.use(express.static(path.join(__dirname, '../public')));
// Conectar as rotas criadas nos outros arquivos
app.use('/api/products', require('./routes/products'));
app.use('/api/production', require('./routes/production'));
app.use('/api/purchases', require('./routes/purchases'));

// Iniciar o Servidor
app.listen(PORT, '0.0.0.0', () => {
    const nets = os.networkInterfaces();
    let localIp = 'localhost';
    
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIp = net.address;
            }
        }
    }

    console.log(`\n=================================`);
    console.log(`📡 SERVIDOR DE ESTOQUE ONLINE`);
    console.log(`=================================`);
    console.log(`No seu PC:   http://localhost:${PORT}`);
    console.log(`No Celular:  http://${localIp}:${PORT}`);
    console.log(`=================================\n`);
});