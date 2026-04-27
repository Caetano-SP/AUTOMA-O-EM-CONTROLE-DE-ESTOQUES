const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Cria ou conecta ao arquivo do banco na raiz do projeto
const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Tabela de Fornecedores
    db.run(`CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        origin TEXT DEFAULT 'Nacional',
        lead_time_days INTEGER
    )`);

    // Tabela de Produtos/Componentes
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT UNIQUE NOT NULL,
        category TEXT,
        image_url TEXT,
        current_stock REAL DEFAULT 0,
        min_stock REAL DEFAULT 5,
        unit_measure TEXT DEFAULT 'un',
        is_manufactured BOOLEAN DEFAULT 0,
        supplier_id INTEGER,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )`);

    // Tabela de Receita do Produto (BOM)
    db.run(`CREATE TABLE IF NOT EXISTS product_composition (
        parent_product_id INTEGER,
        child_component_id INTEGER,
        quantity_needed REAL,
        FOREIGN KEY (parent_product_id) REFERENCES products(id),
        FOREIGN KEY (child_component_id) REFERENCES products(id)
    )`);

    // Tabela de Importações/Compras
    db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        quantity INTEGER,
        status TEXT,
        priority TEXT,
        order_date DATE DEFAULT CURRENT_DATE,
        estimated_arrival DATE,
        FOREIGN KEY (product_id) REFERENCES products(id)
    )`);

    // Tabela de Histórico de Movimentações (Auditoria)
    db.run(`CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        type TEXT CHECK(type IN ('IN', 'OUT')),
        quantity REAL NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
    )`);
});

module.exports = db;