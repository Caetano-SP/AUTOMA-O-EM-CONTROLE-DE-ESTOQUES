// URL base da nossa API
const API_URL = 'http://localhost:3000/api';

// Função que roda assim que a página abre
document.addEventListener('DOMContentLoaded', () => {
    carregarProdutos();
});

// Função para buscar e renderizar os produtos
async function carregarProdutos() {
    try {
        const response = await fetch(`${API_URL}/products`);
        const produtos = await response.json();
        
        const tbody = document.querySelector('#products-table tbody');
        tbody.innerHTML = ''; // Limpa a tabela
        
        document.getElementById('total-items').innerText = produtos.length;
        let criticos = 0;

        produtos.forEach(prod => {
            // Conta itens críticos
            if(prod.current_stock < prod.min_stock) criticos++;

            // Define a cor da badge de estoque
            const statusClass = prod.current_stock < prod.min_stock ? 'badge low' : 'badge ok';
            
            // Renderiza a foto ou um icone genérico se não tiver
            const imgHtml = prod.image_url 
                ? `<img src="${prod.image_url}" alt="Foto">` 
                : `<div style="width:40px;height:40px;background:#e2e8f0;border-radius:6px;display:flex;align-items:center;justify-content:center;"><i class="ph ph-image"></i></div>`;

            // Monta a linha da tabela
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${imgHtml}</td>
                <td><strong>${prod.sku}</strong></td>
                <td>${prod.name} <br><small style="color:#94a3b8">${prod.is_manufactured ? 'Manufaturado' : 'Comprado'}</small></td>
                <td>${prod.category}</td>
                <td><span class="${statusClass}">${prod.current_stock} ${prod.unit_measure}</span></td>
                <td><button style="border:none;background:none;color:#3b82f6;cursor:pointer;"><i class="ph ph-pencil-simple" style="font-size:1.2rem;"></i></button></td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('critical-items').innerText = criticos;

    } catch (error) {
        console.error("Erro ao carregar produtos:", error);
    }
}

// Controles do Modal
function abrirModal() {
    document.getElementById('modal-novo-item').style.display = 'flex';
}

function fecharModal() {
    document.getElementById('modal-novo-item').style.display = 'none';
    document.getElementById('form-produto').reset(); // Limpa os campos
}

// Lógica de envio de dados e arquivo (Foto)
async function salvarProduto(event) {
    event.preventDefault(); // Impede a página de recarregar
    
    const formData = new FormData();
    formData.append('name', document.getElementById('nome').value);
    formData.append('sku', document.getElementById('sku').value);
    formData.append('category', document.getElementById('categoria').value);
    formData.append('is_manufactured', document.getElementById('is_manufactured').value);
    
    // Pega o arquivo da foto, se houver
    const fotoInput = document.getElementById('foto');
    if (fotoInput.files.length > 0) {
        formData.append('foto', fotoInput.files[0]);
    }

    try {
        const response = await fetch(`${API_URL}/products`, {
            method: 'POST',
            body: formData // Enviamos como FormData por causa da imagem
        });

        if (response.ok) {
            fecharModal();
            carregarProdutos(); // Atualiza a tabela na mesma hora
            alert("Item cadastrado com sucesso!");
        } else {
            alert("Erro ao cadastrar o item.");
        }
    } catch (error) {
        console.error("Erro na comunicação com o servidor:", error);
    }
}
// ==========================================
// LÓGICA DE COMPRAS / IMPORTAÇÕES
// ==========================================

// Puxa os produtos do banco e coloca no Select (Dropdown)
async function carregarProdutosParaCompra() {
    try {
        const response = await fetch(`${API_URL}/products`);
        const produtos = await response.json();
        
        const select = document.getElementById('compra_produto_id');
        select.innerHTML = '<option value="">Selecione o Item...</option>';
        
        produtos.forEach(prod => {
            // Filtra: Só exibe itens que NÃO são manufaturados por nós (Matéria Prima)
            if(prod.is_manufactured === 0) {
                select.innerHTML += `<option value="${prod.id}">${prod.sku} - ${prod.name}</option>`;
            }
        });
    } catch (error) {
        console.error("Erro ao carregar itens para compra:", error);
    }
}

// Controles do Modal de Compra
function abrirModalCompra() {
    carregarProdutosParaCompra(); // Atualiza a lista sempre que abrir
    document.getElementById('modal-nova-compra').style.display = 'flex';
}

function fecharModalCompra() {
    document.getElementById('modal-nova-compra').style.display = 'none';
    document.getElementById('form-compra').reset();
}

// Salva a Compra no Banco de Dados
async function salvarCompra(event) {
    event.preventDefault();
    
    // Monta o JSON com os dados do formulário
    const dadosCompra = {
        product_id: document.getElementById('compra_produto_id').value,
        quantity: document.getElementById('compra_quantidade').value,
        priority: document.getElementById('compra_prioridade').value,
        estimated_arrival: document.getElementById('compra_previsao').value
    };

    try {
        const response = await fetch(`${API_URL}/purchases`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosCompra)
        });

        if (response.ok) {
            fecharModalCompra();
            alert("✅ Importação registrada! O sistema agora está monitorando este pedido.");
        } else {
            alert("❌ Erro ao registrar a importação.");
        }
    } catch (error) {
        console.error("Erro de conexão:", error);
    }
}