const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'), (err) => {
    if (err) console.error("Erro ao abrir banco:", err.message);
    else console.log("📦 Banco de Dados SQLite Conectado.");
});

db.serialize(() => {
    // Tabela de Usuários (Com Senha Criptografada e RBAC)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'operator'
    )`);

    // AUTO-MIGRAÇÃO DE SEGURANÇA: RBAC
    db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'operator'", (err) => {
        if (!err) {
            console.log("⚙️ Banco de dados atualizado: Coluna 'role' injetada.");
        }
        // Sempre executa a definição de administradores primários (Lucas 360 e Alexandre como admin)
        db.run("UPDATE users SET role = 'admin' WHERE id = 1 OR username = 'Lucas 360' OR name = 'Lucas 360' OR username = 'lucas' OR username = 'admin' OR username = 'Ale' OR name LIKE '%Alexandre%'", (err2) => {
            if (!err2) {
                // E garante que Leonardo Alves seja operador
                db.run("UPDATE users SET role = 'operator' WHERE (id > 1 AND (username IN ('Leonardo') OR name LIKE '%Leonardo%') AND username != 'Ale' AND name NOT LIKE '%Alexandre%')", (err3) => {
                    if (!err3) console.log("👑 Migração concluída: Administradores (Lucas 360, Alexandre) e Operador (Leonardo) definidos.");
                });
            }
        });
    });

    // Tabela de Produtos
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        sku TEXT UNIQUE,
        category TEXT,
        current_stock REAL DEFAULT 0,
        min_stock REAL DEFAULT 5,
        image_url TEXT,
        is_manufactured INTEGER DEFAULT 0
    )`);

    // Tabela de Receitas (BOM)
    db.run(`CREATE TABLE IF NOT EXISTS product_composition (
        parent_product_id INTEGER,
        child_component_id INTEGER,
        quantity_needed REAL,
        FOREIGN KEY(parent_product_id) REFERENCES products(id),
        FOREIGN KEY(child_component_id) REFERENCES products(id)
    )`);

    // Tabela de Movimentações (Histórico/Auditoria)
    db.run(`CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        type TEXT,
        quantity REAL,
        reason TEXT,
        user_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de Compras/Importações
    db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        quantity REAL,
        status TEXT,
        priority TEXT,
        estimated_arrival DATE
    )`);

    // Tabela de Pedidos dos Clientes
    db.run(`CREATE TABLE IF NOT EXISTS client_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_name TEXT NOT NULL,
        address TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'Fila',
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        shipped_at DATETIME
    )`);

    // AUTO-MIGRAÇÃO: Campos novos para exportação de Pedidos
    db.run("ALTER TABLE client_orders ADD COLUMN total_products REAL DEFAULT 0", () => {});
    db.run("ALTER TABLE client_orders ADD COLUMN carrier TEXT DEFAULT ''", () => {});
    db.run("ALTER TABLE client_orders ADD COLUMN total_value REAL DEFAULT 0", () => {});
});

module.exports = db;