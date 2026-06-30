const socket = io();
const API_URL = window.location.origin + '/api';
let insumosGlobais = [];

// Retorna as credenciais para o fetch
function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    };
}

// ==========================================
// INICIALIZAÇÃO, SESSÃO E MODO DARK
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Injetor do Motor PWA (Para o App poder ser instalado)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log("Erro no PWA", err));
    }
    // 1. Validação de Sessão (O Porteiro)
    const cracha = localStorage.getItem('token');
    const nomeUser = localStorage.getItem('userName');
    const userLogado = localStorage.getItem('username_login') || '';

    if (cracha && nomeUser) {
        document.getElementById('login-screen').style.display = 'none';
        document.querySelector('.user-profile .info span').innerText = nomeUser;

        const role = localStorage.getItem('userRole') || '';
        let roleDisplay = 'Equipe Operacional';
        if (role === 'admin') {
            roleDisplay = (nomeUser.includes('Alexandre') || userLogado === 'Ale') ? 'Chefe' : 'Gestor';
        } else if (role === 'technician') {
            roleDisplay = 'Técnico';
        } else if (role === 'operator') {
            roleDisplay = 'Operador';
        }
        document.querySelector('.user-profile .info small').innerText = roleDisplay;

        // Controle de Acesso (RBAC) - Bloqueios Visuais para Operadores
        if (role !== 'admin') {
            document.getElementById('menu-equipe').innerHTML = '<i class="ph ph-lock"></i> <span>Equipe</span>';
            document.getElementById('menu-historico').innerHTML = '<i class="ph ph-lock"></i> <span>Auditoria</span>';
            document.getElementById('menu-equipe').style.opacity = '0.5';
            document.getElementById('menu-historico').style.opacity = '0.5';
            
            // Impede o clique para operadores
            document.getElementById('menu-equipe').onclick = (e) => { e.preventDefault(); alert("⚠️ Acesso restrito a gestores."); };
            document.getElementById('menu-historico').onclick = (e) => { e.preventDefault(); alert("⚠️ Acesso restrito a gestores."); };
        } else {
            document.getElementById('menu-equipe').style.display = 'flex';
        }
        carregarProdutos();

        // Inicializa visibilidade de colunas
        ['products-table', 'imports-table', 'history-table', 'receitas-table', 'orders-table'].forEach(tableId => {
            applyColumnVisibility(tableId);
            renderColumnDropdown(tableId);
        });

        // 2. Inteligência de UI: Onboarding do Dark Mode
        // Lê a memória: O usuário já definiu algo antes?
        const temaGuardado = localStorage.getItem('dark-mode');

        if (temaGuardado === 'true') {
            document.body.classList.add('dark-mode'); // Já entra direto sem piscar
            atualizarBotaoDarkMode(true);
        } else if (temaGuardado === null) {
            // Se for a PRIMEIRA VEZ do usuário (null), pergunta a ele após 1.5s
            setTimeout(() => {
                sugerirModoDark();
            }, 1500);
        } else {
            atualizarBotaoDarkMode(false);
        }
    } else {
        // Trava final: Sem crachá, joga pro login
        document.getElementById('login-screen').style.display = 'flex';
    }
});

// A Função que levanta a pergunta (Usa a mesma engenharia do seu Modal Premium de Confirmação!)
async function sugerirModoDark() {
    const ativar = await confirmacaoPremium("Olá! Nosso sistema possui um Modo Escuro que protege sua visão durante o uso. Deseja ativá-lo agora?");

    if (ativar) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('dark-mode', 'true');
        atualizarBotaoDarkMode(true);
        mostrarNotificacao("Modo Escuro ativado! Você pode trocar a qualquer momento no menu lateral.", "sucesso");
    } else {
        // Marca como falso para não incomodar o usuário nos próximos F5
        localStorage.setItem('dark-mode', 'false');
        atualizarBotaoDarkMode(false);
    }
}

window.fazerLogin = async function (event) {
    if (event) event.preventDefault(); // Impede o "piscar" e recarregar da página
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();

        if (data.success) {
            localStorage.setItem('userName', data.user.name);
            localStorage.setItem('userRole', data.user.role);
            localStorage.setItem('token', data.token);
            localStorage.setItem('username_login', user);
            await registrarAuditoria('🚪 Acesso', 'Fez login no sistema');
            window.location.reload(); // Só recarrega depois de salvar o crachá
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error("Erro no login:", error);
        mostrarNotificacao("Falha de conexão com o servidor no momento do login.", "erro");
    }
};

async function sairDoSistema() {
    const confirmou = await confirmacaoPremium("Deseja fechar o seu turno e sair do sistema?");
    if (confirmou) {
        // Removemos apenas os dados de sessão para proteger o Dark Mode
        localStorage.removeItem('token');
        localStorage.removeItem('userName');
        localStorage.removeItem('username_login');
        window.location.reload();
    }
}

socket.on('estoque_alterado', () => {
    carregarProdutos();
    if (document.getElementById('view-historico').style.display === 'block') carregarHistorico();
});
socket.on('pedidos_alterados', () => {
    if (document.getElementById('view-pedidos').style.display === 'block') carregarPedidos();
});

// ==========================================
// PRODUTOS GERAIS
// ==========================================
async function carregarProdutos() {
    try {
        const res = await fetch(`${API_URL}/products`, { headers: getAuthHeaders() });

        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('userName');
            window.location.reload();
            return;
        }

        const produtos = await res.json();

        const tbody = document.querySelector('#products-table tbody');
        tbody.innerHTML = '';

        document.getElementById('total-items').innerText = produtos.length;
        let criticos = 0;

        produtos.forEach(prod => {
            if (prod.current_stock < prod.min_stock) criticos++;
            const statusClass = prod.current_stock < prod.min_stock ? 'badge low' : 'badge ok';

            const imgHtml = `
                <div style="position: relative; width: 100px; height: 100px;">
                    ${prod.image_url ?
                    `<img src="${prod.image_url}" style="width:100%; height:100%; object-fit:cover; border-radius:8px; border:1px solid #e2e8f0;">` :
                    `<div style="width:100%;height:100%;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;"><i class="ph ph-image" style="font-size: 1.5rem; color: #94a3b8;"></i></div>`
                }
                    <button onclick="selecionarNovaFoto(${prod.id})" style="position: absolute; bottom: -8px; right: -8px; background: var(--primary); color: white; border: none; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; display:flex; align-items:center; justify-content:center; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                        <i class="ph ph-pencil-simple" style="font-size: 0.9rem;"></i>
                    </button>
                </div>
            `;
            let tipoTexto = prod.is_manufactured == 1 ? 'Produto Final' : (prod.is_manufactured == 2 ? 'Submontagem' : 'Comprado');

            const tr = document.createElement('tr');
            tr.dataset.id = prod.id;
            tr.dataset.fornecedor = prod.supplier || '360virtu';
            tr.dataset.tipo = (prod.is_manufactured !== null && prod.is_manufactured !== undefined) ? prod.is_manufactured : 0;
            tr.innerHTML = `
                <td>${imgHtml}</td>
                <td><strong>${prod.name}</strong> <br><small style="color:#94a3b8">${tipoTexto}</small></td>
                <td><span style="color:var(--text-muted); font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${prod.sku}</span></td>
                <td>${prod.category}</td>
                <td><span style="color:#64748b; font-size:0.9rem;"><i class="ph ph-storefront"></i> ${prod.supplier || '360virtu'}</span></td>
                <td><span class="${statusClass}">${prod.current_stock} un</span></td>
                <td><button onclick="ajustarEstoque(${prod.id}, '${prod.name}', ${prod.current_stock})" style="border:none;background:none;color:#3b82f6;cursor:pointer;"><i class="ph ph-pencil-simple" style="font-size:1.4rem;"></i></button></td>
            `;
            tbody.appendChild(tr);
        });
        document.getElementById('critical-items').innerText = criticos;
    } catch (e) {
        console.error("Erro ao carregar:", e);
        mostrarNotificacao("Falha de conexão ao buscar o inventário no servidor.", "erro");
    }
}

function filtrarTabela() {
    const termo = document.getElementById('filtro-produtos').value.toLowerCase();
    document.querySelectorAll('#products-table tbody tr').forEach(linha => {
        linha.style.display = linha.innerText.toLowerCase().includes(termo) ? '' : 'none';
    });
}

function abrirModal() { document.getElementById('modal-novo-item').style.display = 'flex'; }
function fecharModal() { document.getElementById('modal-novo-item').style.display = 'none'; document.getElementById('form-produto').reset(); }

async function salvarProduto(event) {
    if (event) event.preventDefault();
    const formData = new FormData();
    let inputSku = document.getElementById('sku').value.trim();
    if (!inputSku) {
        inputSku = 'AUTO-' + Math.floor(Math.random() * 1000000);
    }
    
    formData.append('name', document.getElementById('nome').value);
    formData.append('sku', inputSku);
    formData.append('category', document.getElementById('categoria').value);
    formData.append('supplier', document.getElementById('fornecedor').value);
    formData.append('is_manufactured', document.getElementById('is_manufactured').value);

    if (document.getElementById('foto').files.length > 0) {
        formData.append('foto', document.getElementById('foto').files[0]);
    }

    try {
        const res = await fetch(`${API_URL}/products`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });

        if (res.ok) {
            await registrarAuditoria('📦 Catálogo', 'Cadastrou o produto: ' + document.getElementById('nome').value);
            fecharModal();
            carregarProdutos();
            alert("✅ Produto cadastrado com sucesso!");
        } else {
            alert("❌ Erro ao cadastrar. Verifique se o SKU já existe ou se a sessão expirou.");
        }
    } catch (erro) {
        console.error("Erro na comunicação:", erro);
        mostrarNotificacao("Ocorreu uma falha grave na rede ao tentar cadastrar o produto.", "erro");
    }
}

function ajustarEstoque(id, nome, estoqueAtual) {
    const linhas = Array.from(document.querySelectorAll('#products-table tbody tr'));
    // Busca direto pela ID blindada
    const linhaAlvo = linhas.find(tr => tr.dataset.id == id);

    document.getElementById('ajuste_produto_id').value = id;
    document.getElementById('ajuste_nome').value = nome;
    document.getElementById('ajuste_quantidade').value = estoqueAtual;
    
    // RBAC: Trava visual do botão de lixeira
    const role = localStorage.getItem('userRole');
    if (role !== 'admin') {
        const btnExcluir = document.getElementById('btn-excluir-produto');
        if (btnExcluir) {
            btnExcluir.innerHTML = '<i class="ph ph-lock"></i>';
            btnExcluir.style.opacity = '0.5';
            btnExcluir.onclick = (e) => { e.preventDefault(); alert("⚠️ Apenas gestores podem excluir itens."); };
        }
    }

    if (linhaAlvo) {
        document.getElementById('ajuste_categoria').value = linhaAlvo.cells[3].innerText;
        // Puxa o fornecedor puro, ignorando o ícone!
        const fornLimpo = linhaAlvo.dataset.fornecedor;
        document.getElementById('ajuste_fornecedor').value = fornLimpo === '360virtu' ? '' : fornLimpo;

        document.getElementById('ajuste_tipo').value = String(linhaAlvo.dataset.tipo);
    }

    document.getElementById('modal-ajuste-estoque').style.display = 'flex';
}

async function salvarAjusteEstoque(event) {
    event.preventDefault();
    const id = document.getElementById('ajuste_produto_id').value;
    const dados = {
        name: document.getElementById('ajuste_nome').value,
        category: document.getElementById('ajuste_categoria').value,
        supplier: document.getElementById('ajuste_fornecedor').value,
        is_manufactured: document.getElementById('ajuste_tipo').value,
        stock: parseFloat(document.getElementById('ajuste_quantidade').value),
        userName: localStorage.getItem('userName')
    };

    const res = await fetch(`${API_URL}/products/${id}/stock`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(dados)
    });

    // TRAVA DE SEGURANÇA: Se o crachá estiver vencido
    if (res.status === 401 || res.status === 403) {
        mostrarNotificacao("Sessão expirada por segurança. O sistema reiniciará para um novo login.", "aviso");
        localStorage.removeItem('token');
        localStorage.removeItem('userName');
        setTimeout(() => window.location.reload(), 2000);
        return;
    }

    if (res.ok) {
        await registrarAuditoria('✏️ Edição', `Alterou dados do item: ${dados.name}`);
        fecharModalAjuste();
        carregarProdutos();
        alert("✅ Item atualizado com sucesso!");
    }
}
function fecharModalAjuste() { document.getElementById('modal-ajuste-estoque').style.display = 'none'; }


async function excluirProduto() {
    const id = document.getElementById('ajuste_produto_id').value;
    if (await confirmacaoPremium("ATENÇÃO: Deseja apagar permanentemente este item?")) {
        const res = await fetch(`${API_URL}/products/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        if (res.ok) {
            await registrarAuditoria('🗑️ Catálogo', 'Excluiu o produto ID: ' + id); // <-- ADICIONE AQUI
            fecharModalAjuste();
            carregarProdutos();
            alert("✅ Item excluído com sucesso!");
        } else {
            alert("❌ Acesso negado.");
        }
    }
}



// ==========================================
// MÓDULO 1: ENGENHARIA (CONTROLE DE RECEITAS - BOM)
// ==========================================

async function carregarEngenharia() {
    try {
        // 1. Carrega todos os produtos para popular os insumos globais e dropdown
        const resProds = await fetch(`${API_URL}/products`, { headers: getAuthHeaders() });
        if (resProds.status === 401 || resProds.status === 403) return sairDoSistema();
        const produtos = await resProds.json();

        // Filtra insumos (Comprados ou Submontagens)
        insumosGlobais = produtos.filter(p => p.is_manufactured == 0 || p.is_manufactured == 2);

        // Preenche o seletor de produto pai no editor
        const selectProduto = document.getElementById('bom_produto_id');
        selectProduto.innerHTML = '<option value="">Selecione o produto final...</option>';
        produtos.forEach(p => {
            if (p.is_manufactured == 1 || p.is_manufactured == 2) {
                selectProduto.innerHTML += `<option value="${p.id}">${p.name} (${p.sku})</option>`;
            }
        });

        // 2. Carrega todas as composições ativas (receitas salvas)
        const resComps = await fetch(`${API_URL}/products/composition`, { headers: getAuthHeaders() });
        const receitas = await resComps.json();

        // Atualiza estatística do painel
        document.getElementById('total-receitas').innerText = receitas.length;

        // Renderiza a tabela de receitas
        const tbody = document.querySelector('#receitas-table tbody');
        tbody.innerHTML = '';

        if (receitas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhuma receita cadastrada ainda.</td></tr>';
            return;
        }

        const role = localStorage.getItem('userRole');
        receitas.forEach(rec => {
            // Se for operador, as ações de editar/excluir aparecem desabilitadas
            const btnExcluirHtml = role === 'admin' 
                ? `<button onclick="excluirReceita(${rec.id})" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.2rem;" title="Excluir Receita"><i class="ph ph-trash"></i></button>`
                : `<button disabled style="background:none; border:none; color:var(--text-muted); opacity:0.5; cursor:not-allowed; font-size:1.2rem;"><i class="ph ph-lock"></i></button>`;

            tbody.innerHTML += `<tr>
                <td><strong>${rec.name}</strong></td>
                <td><span style="color:var(--text-muted); font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${rec.sku}</span></td>
                <td>${rec.category}</td>
                <td><span class="badge ok" style="background-color:#e0f2fe; color:#0369a1;">${rec.component_count} itens</span></td>
                <td>
                    <div style="display:flex; gap:12px; align-items:center;">
                        <button onclick="editarReceita(${rec.id})" style="background:none; border:none; color:#3b82f6; cursor:pointer; font-size:1.2rem;" title="Editar Receita"><i class="ph ph-pencil-simple"></i></button>
                        ${btnExcluirHtml}
                    </div>
                </td>
            </tr>`;
        });
    } catch (error) {
        console.error('Falha de conexão na Engenharia:', error);
        mostrarNotificacao("Falha de conexão ao carregar painel de Engenharia.", "erro");
    }
}

async function aoSelecionarProdutoPai(productId) {
    const listDiv = document.getElementById('lista-componentes');
    listDiv.innerHTML = '';
    
    if (!productId) {
        document.getElementById('titulo-editor-bom').innerHTML = '<i class="ph ph-plus-circle"></i> Criar Nova Receita';
        return;
    }

    try {
        // Busca se já existe uma receita para este produto final
        const res = await fetch(`${API_URL}/products/${productId}/composition`, { headers: getAuthHeaders() });
        const componentes = await res.json();

        if (componentes.length > 0) {
            document.getElementById('titulo-editor-bom').innerHTML = '<i class="ph ph-pencil-simple"></i> Editar Receita Existente';
            componentes.forEach(c => {
                adicionarLinhaInsumo(c.child_id, c.quantity);
            });
        } else {
            document.getElementById('titulo-editor-bom').innerHTML = '<i class="ph ph-plus-circle"></i> Criar Nova Receita';
        }
    } catch (e) {
        console.error('Erro ao buscar composição do produto selecionado:', e);
    }
}

function editarReceita(parentId) {
    const select = document.getElementById('bom_produto_id');
    select.value = parentId;
    // Dispara a atualização manual do editor de insumos
    aoSelecionarProdutoPai(parentId);
    // Rola suavemente até o editor no mobile
    document.getElementById('titulo-editor-bom').scrollIntoView({ behavior: 'smooth' });
}

function limparEditorBOM() {
    document.getElementById('form-receita').reset();
    document.getElementById('lista-componentes').innerHTML = '';
    document.getElementById('titulo-editor-bom').innerHTML = '<i class="ph ph-plus-circle"></i> Criar Nova Receita';
}

function adicionarLinhaInsumo(childId = '', quantity = 1) {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.alignItems = 'center';
    div.style.width = '100%';

    let options = '<option value="">Insumo...</option>';
    insumosGlobais.forEach(p => {
        const selected = String(p.id) === String(childId) ? 'selected' : '';
        options += `<option value="${p.id}" ${selected}>${p.name} (${p.sku})</option>`;
    });

    div.innerHTML = `
        <select class="comp-id" style="flex: 2; min-width: 0; width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; outline: none; background-color: var(--card-bg); color: var(--text-main);">${options}</select>
        <input type="number" class="comp-qtd" value="${quantity}" min="0.0001" step="any" style="flex: 1; min-width: 0; width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; outline: none; background-color: var(--card-bg); color: var(--text-main);" placeholder="Qtd">
        <button type="button" onclick="this.parentElement.remove()" style="color: var(--danger); border: none; background: none; font-size: 1.4rem; cursor: pointer; padding: 0 5px; display: flex; align-items: center;"><i class="ph ph-trash"></i></button>`;

    document.getElementById('lista-componentes').appendChild(div);
}

async function salvarReceita(event) {
    event.preventDefault();
    const role = localStorage.getItem('userRole');
    if (role !== 'admin') {
        alert("❌ Acesso negado: Apenas gestores (admins) podem criar ou editar receitas.");
        return;
    }

    const parentId = document.getElementById('bom_produto_id').value;
    const components = Array.from(document.querySelectorAll('.comp-id'))
        .map((sel, i) => ({ 
            child_id: parseInt(sel.value), 
            quantity: parseFloat(document.querySelectorAll('.comp-qtd')[i].value) 
        }))
        .filter(c => c.child_id && c.quantity > 0);

    if (components.length === 0) {
        alert("❌ Adicione pelo menos um insumo válido com quantidade maior que zero.");
        return;
    }

    try {
        const res = await fetch(`${API_URL}/products/${parentId}/composition`, {
            method: 'POST', 
            headers: getAuthHeaders(), 
            body: JSON.stringify({ components })
        });

        if (res.status === 401 || res.status === 403) return sairDoSistema();

        if (res.ok) {
            await registrarAuditoria('⚙️ Engenharia', 'Atualizou a receita da Placa/Produto ID: ' + parentId);
            limparEditorBOM();
            carregarEngenharia();
            alert("✅ Receita salva com sucesso!");
        } else {
            alert("❌ Erro ao salvar receita. Verifique os insumos.");
        }
    } catch (e) {
        console.error(e);
        alert("❌ Falha de conexão ao salvar receita.");
    }
}

async function excluirReceita(parentId) {
    const role = localStorage.getItem('userRole');
    if (role !== 'admin') {
        alert("❌ Acesso negado: Apenas gestores podem excluir receitas.");
        return;
    }

    const confirmou = await confirmacaoPremium("Deseja apagar por completo a árvore de receita deste produto? Os insumos associados serão removidos.");
    if (!confirmou) return;

    try {
        const res = await fetch(`${API_URL}/products/${parentId}/composition`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (res.status === 401 || res.status === 403) return sairDoSistema();

        if (res.ok) {
            await registrarAuditoria('🗑️ Engenharia', 'Excluiu por completo a receita do produto ID: ' + parentId);
            limparEditorBOM();
            carregarEngenharia();
            alert("✅ Receita excluída com sucesso!");
        } else {
            alert("❌ Erro ao excluir receita.");
        }
    } catch (e) {
        console.error(e);
        alert("❌ Falha de conexão ao excluir receita.");
    }
}


// ==========================================
// MÓDULO 2: PRODUÇÃO (DAR BAIXA)
// ==========================================

async function abrirModalProducao() {
    try {
        const res = await fetch(`${API_URL}/products`, { headers: getAuthHeaders() });

        if (res.status === 401 || res.status === 403) {
            alert('Sessão expirada. O sistema será bloqueado por segurança.');
            if (typeof sairDoSistema === 'function') return sairDoSistema();
            return;
        }

        const produtos = await res.json();
        const selectProduto = document.getElementById('prod_produto_id');

        selectProduto.innerHTML = '<option value="">Selecione o Produto para Fabricar...</option>';

        produtos.forEach(p => {
            if (p.is_manufactured == 1 || p.is_manufactured == 2) {
                selectProduto.innerHTML += `<option value="${p.id}">${p.name} (${p.sku})</option>`;
            }
        });

        document.getElementById('modal-producao').style.display = 'flex';
    } catch (error) {
        console.error('Falha de conexão na Produção:', error);
        alert('Erro ao abrir a linha de produção.');
    }
};

function fecharModalProducao() { document.getElementById('modal-producao').style.display = 'none'; }

async function salvarProducao(event) {
    event.preventDefault();
    const token = localStorage.getItem('token');

    const res = await fetch(`${API_URL}/production/fabricate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` // Crachá explícito aqui
        },
        body: JSON.stringify({
            productId: document.getElementById('prod_produto_id').value,
            quantity: document.getElementById('prod_quantidade').value
        })
    });

    if (res.ok) {
        fecharModalProducao();
        alert("✅ Baixa realizada com sucesso!");
        carregarProdutos();
    } else {
        const erro = await res.json();
        alert("❌ Erro: " + (erro.error || "Verifique o crachá ou estoque."));
    }
}

// ==========================================
// COMPRAS E LOGÍSTICA
// ==========================================
async function abrirModalCompra() {
    const res = await fetch(`${API_URL}/products`);
    const select = document.getElementById('compra_produto_id');
    select.innerHTML = '<option value="">Selecione...</option>';
    (await res.json()).filter(p => p.is_manufactured == 0 || p.is_manufactured == 2).forEach(p => select.innerHTML += `<option value="${p.id}">${p.name}</option>`);
    document.getElementById('modal-nova-compra').style.display = 'flex';
}
function fecharModalCompra() { document.getElementById('modal-nova-compra').style.display = 'none'; document.getElementById('form-compra').reset(); }

async function salvarCompra(event) {
    event.preventDefault();
    await fetch(`${API_URL}/purchases`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
            product_id: document.getElementById('compra_produto_id').value, quantity: document.getElementById('compra_quantidade').value,
            priority: document.getElementById('compra_prioridade').value, estimated_arrival: document.getElementById('compra_previsao').value
        })
    });
    fecharModalCompra(); alert("Importação registrada!"); carregarListaImportacoes();
}

async function carregarListaImportacoes() {
    try {
        const res = await fetch(`${API_URL}/purchases/pending`, { headers: getAuthHeaders() });

        // Trava de Segurança: Se a sessão expirou
        if (res.status === 401 || res.status === 403) return sairDoSistema();

        const pedidos = await res.json();
        const tbody = document.querySelector('#imports-table tbody');
        tbody.innerHTML = '';

        pedidos.forEach(ped => {
            tbody.innerHTML += `<tr>
                <td><strong>${ped.sku}</strong> <br> <small>${ped.name}</small></td>
                <td><span class="badge ok">+ ${ped.quantity} un</span></td>
                <td>${new Date(ped.estimated_arrival).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                <td style="${ped.priority === 'Crítica' ? 'color: var(--danger); font-weight: 600;' : ''}">${ped.priority}</td>
                <td>
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <button onclick="receberCarga(${ped.id})" class="btn-primary" style="background:#10b981; padding: 8px 12px; font-size: 0.85rem;">Carga Chegou</button>
                        
                        <button onclick="excluirImportacao(${ped.id})" style="background: none; border: none; color: var(--danger); font-size: 1.4rem; cursor: pointer; padding: 4px; transition: 0.2s;" title="Cancelar Importação" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                            <i class="ph ph-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        });
    } catch (e) {
        console.error("Erro ao carregar importações:", e);
        mostrarNotificacao("Erro de conexão ao buscar cargas pendentes.", "erro");
    }
}
async function receberCarga(orderId) {
    if (await confirmacaoPremium("A carga foi conferida fisicamente e chegou completa?")) {
        await fetch(`${API_URL}/purchases/${orderId}/receive`, { method: 'POST', headers: getAuthHeaders() });
        carregarListaImportacoes();
        alert("✅ Estoque atualizado com a nova carga!");
    }
}

// ==========================================
// GESTÃO, FOTOS E NAVEGAÇÃO
// ==========================================
function mudarAba(abaId) {
    ['dashboard', 'importacoes', 'historico', 'pedidos', 'equipe', 'engenharia'].forEach(id => {
        const viewEl = document.getElementById(`view-${id}`);
        if (viewEl) viewEl.style.display = 'none';
    });
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    const viewTarget = document.getElementById(`view-${abaId}`);
    if (viewTarget) viewTarget.style.display = 'block';
    const menuTarget = document.getElementById(`menu-${abaId}`);
    if (menuTarget) menuTarget.classList.add('active');
    
    if (document.querySelector('.sidebar').classList.contains('open')) toggleMenu();
    if (abaId === 'importacoes') carregarListaImportacoes();
    if (abaId === 'historico') carregarHistorico();
    if (abaId === 'pedidos') carregarPedidos();
    if (abaId === 'equipe') carregarEquipe();
    if (abaId === 'engenharia') carregarEngenharia();
}

// ==========================================
// SISTEMA DE FOTOS BLINDADO
// ==========================================
function selecionarNovaFoto(id) {
    document.getElementById('produto-id-foto').value = id;
    const input = document.getElementById('input-trocar-foto');
    input.value = ''; // MÁGICA: Limpa a memória para que o celular permita escolher a mesma foto ou não trave o botão
    input.click();
}

async function enviarNovaFoto() {
    const input = document.getElementById('input-trocar-foto');
    if (input.files.length === 0) return;

    // Mostra na tela que o envio começou
    document.getElementById('notificacao-icone').innerHTML = '<i class="ph ph-cloud-arrow-up" style="color: #3b82f6;"></i>';
    document.getElementById('notificacao-titulo').innerText = "Enviando Foto...";
    document.getElementById('notificacao-mensagem').innerText = "Transferindo imagem para o servidor principal...";
    document.getElementById('modal-notificacao').style.display = 'flex';

    const formData = new FormData();
    formData.append('foto', input.files[0]);

    try {
        const res = await fetch(`${API_URL}/products/${document.getElementById('produto-id-foto').value}/image`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });

        fecharNotificacao();

        if (res.status === 401 || res.status === 403) {
            alert("⚠️ Sessão expirada. O sistema será reiniciado.");
            localStorage.clear();
            window.location.reload();
            return;
        }

        if (res.ok) {
            // Força a página a recarregar para a foto nova já aparecer brilhando na tabela!
            window.location.reload();
        } else {
            alert("❌ Erro no servidor ao salvar a foto.");
        }
    } catch (e) {
        fecharNotificacao();
        alert("❌ Falha de conexão ao enviar a foto pesada.");
    }
}
function abrirModalFuncionario() { document.getElementById('modal-novo-funcionario').style.display = 'flex'; }
function fecharModalFuncionario() { document.getElementById('modal-novo-funcionario').style.display = 'none'; document.getElementById('form-funcionario').reset(); }
async function salvarFuncionario(event) {
    event.preventDefault();
    const payload = {
        name: document.getElementById('func_nome').value,
        username: document.getElementById('func_usuario').value,
        password: document.getElementById('func_senha').value,
        role: document.getElementById('func_role').value
    };
    
    try {
        const res = await fetch(`${API_URL}/users/register`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const roleDesc = payload.role === 'admin' ? 'Gestor' : (payload.role === 'technician' ? 'Técnico' : 'Operador');
            await registrarAuditoria('👤 Equipe', `Cadastrou o usuário: ${payload.name} como ${roleDesc}`);
            fecharModalFuncionario();
            alert("✅ Cadastrado! O acesso já está liberado.");
            carregarEquipe();
        } else {
            const errData = await res.json();
            alert("❌ Erro ao cadastrar: " + (errData.error || "Tente novamente."));
        }
    } catch (e) {
        console.error(e);
        alert("❌ Falha de conexão ao salvar funcionário.");
    }
}

async function carregarEquipe() {
    try {
        const res = await fetch(`${API_URL}/users`, { headers: getAuthHeaders() });
        const grid = document.getElementById('grid-equipe');
        grid.innerHTML = '';
        const usuarios = await res.json();
        
        usuarios.forEach(user => {
            // Se for o Admin Master (ID 1, Lucas 360), o seletor fica desabilitado
            const isMaster = user.id === 1;
            const adminLabel = (user.name.includes('Alexandre') || user.username === 'Ale') ? 'Chefe' : 'Gestor';
            const selectHtml = `
                <select onchange="alterarRoleUsuario(${user.id}, this.value)" ${isMaster ? 'disabled' : ''} style="padding: 6px 12px; font-size: 0.85rem; border-radius: 6px; width: auto; display: inline-block; background-color: var(--bg-color); color: var(--text-main); border: 1px solid var(--border); outline: none;">
                    <option value="operator" ${user.role === 'operator' ? 'selected' : ''}>Operador</option>
                    <option value="technician" ${user.role === 'technician' ? 'selected' : ''}>Técnico</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>${adminLabel}</option>
                </select>
            `;
            
            let roleLabel = 'Operador';
            if (user.role === 'admin') {
                roleLabel = (user.name.includes('Alexandre') || user.username === 'Ale') ? 'Chefe' : 'Gestor';
            } else if (user.role === 'technician') {
                roleLabel = 'Técnico';
            }
            
            grid.innerHTML += `<div style="background:var(--card-bg); border:1px solid var(--border); border-radius:12px; padding:15px; display:flex; justify-content:space-between; align-items:center; gap: 10px; flex-wrap: wrap;">
                <div>
                    <h3 style="margin:0; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        ${user.name} 
                        <span style="font-size: 0.75rem; font-weight: normal; font-family: monospace;">(${roleLabel})</span>
                    </h3>
                    <small style="color: var(--text-muted);">@${user.username}</small>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    ${selectHtml}
                    <button onclick="excluirUsuario(${user.id})" ${isMaster ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} style="background:#fee2e2; color:#ef4444; border:none; padding:10px; border-radius:8px; cursor:pointer;"><i class="ph ph-trash"></i></button>
                </div>
            </div>`;
        });
    } catch (e) {
        console.error("Erro ao carregar equipe:", e);
    }
}

async function alterarRoleUsuario(id, novoRole) {
    try {
        const res = await fetch(`${API_URL}/users/${id}/role`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ role: novoRole })
        });
        
        if (res.ok) {
            mostrarNotificacao("Função do funcionário atualizada com sucesso!", "sucesso");
            const roleDesc = novoRole === 'admin' ? 'Gestor' : (novoRole === 'technician' ? 'Técnico' : 'Operador');
            await registrarAuditoria('👤 Equipe', `Alterou a função do usuário ID ${id} para ${roleDesc}`);
            carregarEquipe();
        } else {
            const errData = await res.json();
            alert("❌ Erro ao alterar função: " + (errData.error || "Tente novamente."));
            carregarEquipe(); // Recarrega para voltar o select ao estado correto
        }
    } catch (e) {
        console.error(e);
        alert("❌ Falha de conexão ao atualizar função.");
        carregarEquipe();
    }
}
async function excluirUsuario(id) {
    if (await confirmacaoPremium("Deseja revogar o acesso deste usuário permanentemente?")) {

        await fetch(`${API_URL}/users/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        await registrarAuditoria('🔒 Equipe', 'Revogou o acesso do usuário ID: ' + id);
        carregarEquipe();
        alert("✅ Acesso revogado.");
    }
}

async function carregarHistorico() {
    try {
        const res = await fetch(`${API_URL}/audit/history`, { headers: getAuthHeaders() });

        // 🚨 O SEGURANÇA INVISÍVEL (Agora sim, checado na hora certa)
        if (res.status === 401 || res.status === 403) {
            localStorage.clear();
            window.location.reload();
            return;
        }

        const historico = await res.json();
        
        // 1. Populando a tabela oculta original para a exportação de Excel/Google
        const tbody = document.querySelector('#history-table tbody');
        tbody.innerHTML = '';

        historico.forEach(log => {
            let prodName = log.product_name || '<i style="color:var(--text-muted)">Sistema</i>';
            let qtdHtml = '';
            let razaoHtml = log.reason;

            if (log.type === 'IN') {
                qtdHtml = `<strong style="color: #10b981;">+${Math.abs(log.quantity)}</strong>`;
            } else if (log.type === 'OUT') {
                qtdHtml = `<strong style="color: #ef4444;">-${Math.abs(log.quantity)}</strong>`;
            } else {
                qtdHtml = `<strong style="color: #3b82f6;">REGISTRO</strong>`;
                if (log.reason && log.reason.includes(' - ')) {
                    const partes = log.reason.split(' - ');
                    razaoHtml = `<strong style="color: var(--text-main);">${partes[0]}</strong><br><small style="color: var(--text-muted);">${partes[1]}</small>`;
                }
            }

            const utcDate = log.created_at.endsWith('Z') ? log.created_at : log.created_at + 'Z';
            tbody.innerHTML += `<tr>
                <td>${new Date(utcDate).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                <td><span class="badge ok">${log.user_name}</span></td>
                <td>${razaoHtml}</td>
                <td>${prodName}</td>
                <td>${qtdHtml}</td>
            </tr>`;
        });

        // 2. Agrupando e populando o container diário visível
        const containerGrouped = document.getElementById('history-grouped-container');
        containerGrouped.innerHTML = '';

        if (historico.length === 0) {
            containerGrouped.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhuma movimentação registrada no histórico.</div>`;
            return;
        }

        const fuso = 'America/Sao_Paulo';
        const formatter = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, year: 'numeric', month: 'numeric', day: 'numeric' });
        const hojeStr = formatter.format(new Date());
        const ontemStr = formatter.format(new Date(Date.now() - 24 * 60 * 60 * 1000));

        const grupos = {};
        const orderDays = [];

        historico.forEach(log => {
            const utcDate = log.created_at.endsWith('Z') ? log.created_at : log.created_at + 'Z';
            const dateObj = new Date(utcDate);
            const dayStr = dateObj.toLocaleDateString('pt-BR', { timeZone: fuso });
            
            let displayDay = dayStr;
            if (dayStr === hojeStr) {
                displayDay = 'Hoje';
            } else if (dayStr === ontemStr) {
                displayDay = 'Ontem';
            }
            
            if (!grupos[dayStr]) {
                grupos[dayStr] = {
                    displayDay: displayDay,
                    logs: []
                };
                orderDays.push(dayStr);
            }
            grupos[dayStr].logs.push({ log, dateObj });
        });

        orderDays.forEach(dayStr => {
            const grupo = grupos[dayStr];
            
            const headerHtml = `
                <div class="day-group-header" style="display: flex; align-items: center; gap: 8px; margin-top: 25px; margin-bottom: 12px; font-weight: 600; font-size: 1.05rem; color: var(--text-main);">
                    <i class="ph ph-calendar-blank" style="font-size: 1.3rem; color: var(--primary);"></i>
                    <span>${grupo.displayDay}</span>
                </div>
            `;
            
            let rowsHtml = '';
            grupo.logs.forEach(({ log, dateObj }) => {
                let prodName = log.product_name || '<i style="color:var(--text-muted)">Sistema</i>';
                let qtdHtml = '';
                let razaoHtml = log.reason;

                if (log.type === 'IN') {
                    qtdHtml = `<strong style="color: #10b981;">+${Math.abs(log.quantity)}</strong>`;
                } else if (log.type === 'OUT') {
                    qtdHtml = `<strong style="color: #ef4444;">-${Math.abs(log.quantity)}</strong>`;
                } else {
                    qtdHtml = `<strong style="color: #3b82f6;">REGISTRO</strong>`;
                    if (log.reason && log.reason.includes(' - ')) {
                        const partes = log.reason.split(' - ');
                        razaoHtml = `<strong style="color: var(--text-main);">${partes[0]}</strong><br><small style="color: var(--text-muted);">${partes[1]}</small>`;
                    }
                }
                
                const horaStr = dateObj.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', second: '2-digit' });

                rowsHtml += `
                    <tr>
                        <td style="width: 100px;">${horaStr}</td>
                        <td style="width: 150px;"><span class="badge ok">${log.user_name}</span></td>
                        <td>${razaoHtml}</td>
                        <td>${prodName}</td>
                        <td style="width: 100px; text-align: right;">${qtdHtml}</td>
                    </tr>
                `;
            });
            
            const tableHtml = `
                ${headerHtml}
                <div class="table-container">
                    <table class="history-grouped-table">
                        <thead>
                            <tr>
                                <th style="width: 100px;">Hora</th>
                                <th style="width: 150px;">Funcionário</th>
                                <th>Ação / Descrição</th>
                                <th>Item</th>
                                <th style="width: 100px; text-align: right;">Qtd.</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            `;
            
            containerGrouped.innerHTML += tableHtml;
        });
    } catch (e) { console.error("Erro no histórico: ", e); }
}
function toggleMenu() { document.querySelector('.sidebar').classList.toggle('open'); document.getElementById('sidebar-overlay').classList.toggle('active'); }
// ==========================================
// EXPORTAÇÃO PARA EXCEL (CSV)
// ==========================================
function exportarTabelaParaExcel(tabelaId, nomeArquivo) {
    const tabela = document.getElementById(tabelaId);
    let csv = [];

    // Pega todas as linhas da tabela
    const linhas = tabela.querySelectorAll('tr');

    for (let i = 0; i < linhas.length; i++) {
        let linha, colunas = linhas[i].querySelectorAll('td, th');
        let arrayColunas = [];

        for (let j = 0; j < colunas.length; j++) {
            // Limpa o texto (remove quebras de linha e o HTML extra)
            let texto = colunas[j].innerText.replace(/(\r\n|\n|\r)/gm, " ").trim();
            // Evita problemas com ponto e vírgula no meio do texto
            arrayColunas.push('"' + texto + '"');
        }

        // O Excel no Brasil usa o ponto e vírgula (;) para separar as colunas
        csv.push(arrayColunas.join(';'));
    }

    // Monta o arquivo e faz o download
    const csvTexto = "\uFEFF" + csv.join('\n'); // "\uFEFF" garante que os acentos (ç, ã) fiquem perfeitos
    const blob = new Blob([csvTexto], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", nomeArquivo + ".csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
// ==========================================
// PAINEL DE ESTOQUE CRÍTICO
// ==========================================
async function abrirModalCriticos() {
    // 1. Abre a janela na tela
    document.getElementById('modal-criticos').style.display = 'flex';
    const tbody = document.querySelector('#tabela-criticos tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Buscando dados no galpão...</td></tr>';

    try {
        // 2. Pergunta ao servidor quem está abaixo do mínimo
        const res = await fetch(`${API_URL}/products/alerts/critical`, {
            headers: getAuthHeaders()
        });
        const produtos = await res.json();

        tbody.innerHTML = ''; // Limpa a tabela

        if (produtos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhum item em estado crítico! 🎉</td></tr>';
            return;
        }

        // 3. Preenche a tabela com os itens em risco
        produtos.forEach(prod => {
            const defasagem = prod.min_stock - prod.current_stock;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${prod.sku}</strong><br><small>${prod.name}</small></td>
                <td style="color: var(--danger); font-weight: bold;">${prod.current_stock} un</td>
                <td>${prod.min_stock} un</td>
                <td><span class="badge low">Faltam ${defasagem}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Erro ao buscar críticos:", error);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Erro na comunicação com o servidor.</td></tr>';
    }
}

function fecharModalCriticos() {
    // Esconde a janela
    document.getElementById('modal-criticos').style.display = 'none';
}
// ==========================================
// SISTEMA GLOBAL DE NOTIFICAÇÕES (SNACKBARS PREMIUM)
// ==========================================
function mostrarNotificacao(mensagem, tipo = 'sucesso') {
    const container = document.getElementById('snackbar-container');
    if (!container) return; // Se não carregou ainda
    
    const snackbar = document.createElement('div');
    snackbar.className = `snackbar ${tipo}`;
    
    let icone = '';
    if (tipo === 'sucesso') icone = '<i class="ph ph-check-circle" style="color: #10b981; font-size: 1.2rem;"></i>';
    else if (tipo === 'erro') icone = '<i class="ph ph-x-circle" style="color: #ef4444; font-size: 1.2rem;"></i>';
    else icone = '<i class="ph ph-info" style="color: #3b82f6; font-size: 1.2rem;"></i>';
    
    snackbar.innerHTML = `${icone} <span>${mensagem}</span>`;
    container.appendChild(snackbar);
    
    // Some após 4 segundos
    setTimeout(() => {
        snackbar.style.animation = 'snackbarFadeOut 0.3s forwards';
        setTimeout(() => snackbar.remove(), 300);
    }, 4000);
}

function fecharNotificacao() {
    // Legado: função mantida para não quebrar botões antigos, mas não faz nada.
}

// ⚠️ MÁGICA: Sobrescrevendo o alert() antigo do navegador em todo o sistema!
window.alert = function (mensagem) {
    // Se a mensagem tiver o emoji de erro (❌) ou aviso (⚠️), vira modal vermelho
    if (mensagem.includes('❌') || mensagem.includes('⚠️') || mensagem.toLowerCase().includes('erro')) {
        // Limpa os emojis antigos do texto para ficar limpo
        const textoLimpo = mensagem.replace('❌', '').replace('⚠️', '').trim();
        mostrarNotificacao(textoLimpo, 'erro');
    }
    // Se for sucesso (✅)...
    else if (mensagem.includes('✅') || mensagem.toLowerCase().includes('sucesso')) {
        const textoLimpo = mensagem.replace('✅', '').trim();
        mostrarNotificacao(textoLimpo, 'sucesso');
    }
    // Outros tipos de aviso...
    else {
        mostrarNotificacao(mensagem, 'aviso');
    }
};
// ==========================================
// SISTEMA DE CONFIRMAÇÃO PREMIUM (PROMISES)
// ==========================================
window.confirmacaoPremium = function (mensagem) {
    return new Promise((resolve) => {
        // 1. Mostra o texto e abre a tela
        document.getElementById('confirmacao-mensagem').innerText = mensagem;
        document.getElementById('modal-confirmacao').style.display = 'flex';

        const btnConfirmar = document.getElementById('btn-confirmar-acao');
        const btnCancelar = document.querySelector('#modal-confirmacao .btn-secondary');

        // 2. Limpa cliques antigos para não acumular
        const novoBtnConfirmar = btnConfirmar.cloneNode(true);
        const novoBtnCancelar = btnCancelar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);
        btnCancelar.parentNode.replaceChild(novoBtnCancelar, btnCancelar);

        // 3. Se clicar em "Sim, Continuar"
        novoBtnConfirmar.addEventListener('click', () => {
            document.getElementById('modal-confirmacao').style.display = 'none';
            resolve(true); // Devolve VERDADEIRO para o sistema
        });

        // 4. Se clicar em "Cancelar"
        novoBtnCancelar.addEventListener('click', () => {
            document.getElementById('modal-confirmacao').style.display = 'none';
            resolve(false); // Devolve FALSO para o sistema
        });
    });
};
function fecharConfirmacao() {
    document.getElementById('modal-confirmacao').style.display = 'none';
}
// ==========================================
// GERADOR DE QR CODE MOBILE
// ==========================================
function mostrarQRCode() {
    // Pega exatamente o link que está no navegador agora (Ngrok ou Localhost)
    const urlAtual = window.location.origin;

    // Conecta com a API global de QR Codes para gerar a imagem na hora
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(urlAtual)}`;

    // Joga a imagem na tela e abre o modal
    document.getElementById('qr-imagem').src = qrUrl;
    document.getElementById('modal-qrcode').style.display = 'flex';
}

function fecharQRCode() {
    document.getElementById('modal-qrcode').style.display = 'none';
}
// ==========================================
// DISPARADOR DE AUDITORIA UNIVERSAL
// ==========================================
async function registrarAuditoria(acao, detalhe) {
    try {
        await fetch(`${API_URL}/products/audit/log`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ action: acao, detail: detalhe })
        });
    } catch (e) { console.error("Erro ao gravar log", e); }
}
// ==========================================
// EXPORTAÇÃO "CTRL+V" PARA GOOGLE PLANILHAS
// ==========================================
async function exportarParaGooglePlanilhas() {
    const tabela = document.getElementById('history-table');
    let textoPlanilha = "";
    const linhas = tabela.querySelectorAll('tr');

    // Varre a tabela e monta o formato TSV (Tab Separated Values)
    // O Google Sheets entende Tabulação como "pular para a próxima célula"
    for (let i = 0; i < linhas.length; i++) {
        let colunas = linhas[i].querySelectorAll('td, th');
        let arrayLinha = [];
        for (let j = 0; j < colunas.length; j++) {
            arrayLinha.push(colunas[j].innerText.trim());
        }
        textoPlanilha += arrayLinha.join('\t') + "\n";
    }

    try {
        await navigator.clipboard.writeText(textoPlanilha);
        alert("✅ Copiado! Agora vá para o Google Planilhas, clique na célula A1 e aperte CTRL + V.");
    } catch (err) {
        alert("❌ Erro ao copiar. Verifique as permissões do navegador.");
    }
}
// ==========================================
// IMPORTAÇÃO DE PLANILHAS (CSV)
// ==========================================
function abrirModalPlanilha() { document.getElementById('modal-planilha').style.display = 'flex'; }
function fecharModalPlanilha() { document.getElementById('modal-planilha').style.display = 'none'; document.getElementById('arquivo-csv').value = ''; }

// ==========================================
// IMPORTAÇÃO DE PLANILHAS (CSV) CORRIGIDA
// ==========================================
async function processarPlanilha(event) {
    event.preventDefault();
    const arquivo = document.getElementById('arquivo-csv').files[0];
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = async function (e) {
        const conteudo = e.target.result;
        const linhas = conteudo.split('\n');
        const itensParaSalvar = [];

        // Agora ele começa da linha ZERO (não perde arquivos sem cabeçalho)
        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i].trim();
            if (!linha) continue;

            const separador = linha.includes(';') ? ';' : ',';
            const colunas = linha.split(separador);

            // Inteligência: Pula a linha SÓ SE a coluna de Quantidade não for um número (ou seja, se estiver escrito a palavra "Quantidade")
            if (i === 0 && isNaN(parseFloat(colunas[4]))) {
                continue;
            }

            if (colunas.length >= 5) {
                itensParaSalvar.push({
                    nome: colunas[0].trim(),
                    sku: colunas[1].trim(),
                    categoria: colunas[2].trim(),
                    tipo: colunas[3].trim(),
                    quantidade: colunas[4].trim()
                });
            }
        }

        if (itensParaSalvar.length === 0) {
            return alert("❌ Planilha vazia ou com formato incorreto. Verifique as 5 colunas.");
        }

        if (await confirmacaoPremium(`Identificamos ${itensParaSalvar.length} itens na planilha. Deseja iniciar a importação?`)) {
            const res = await fetch(`${API_URL}/products/bulk`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ itens: itensParaSalvar })
            });

            if (res.ok) {
                await registrarAuditoria('🚀 Carga em Lote', `Importou planilha com ${itensParaSalvar.length} itens.`);
                fecharModalPlanilha();
                alert("✅ Lote importado com sucesso!");
                // F5 AUTOMÁTICO: A tela pisca e traz as fotos e dados instantaneamente
                window.location.reload();
            } else {
                alert("❌ Erro ao importar. Verifique se há SKUs duplicados ou erro de conexão.");
            }
        }
    };

    leitor.readAsText(arquivo, 'UTF-8');
}
// ==========================================
// ORDENAÇÃO DE TABELA (A-Z / Z-A)
// ==========================================
let ordemCrescente = true;

function ordenarTabela(indiceColuna) {
    const tbody = document.querySelector('#products-table tbody');
    const linhas = Array.from(tbody.querySelectorAll('tr'));

    linhas.sort((a, b) => {
        // Pega o texto da coluna que você clicou
        let valorA = a.cells[indiceColuna].innerText.toLowerCase();
        let valorB = b.cells[indiceColuna].innerText.toLowerCase();

        // Se for a coluna de Estoque (índice 5), transforma em número para não errar a conta
        if (indiceColuna === 5) {
            valorA = parseFloat(valorA.replace(/[^\d.-]/g, '')) || 0;
            valorB = parseFloat(valorB.replace(/[^\d.-]/g, '')) || 0;
            return ordemCrescente ? valorA - valorB : valorB - valorA;
        }

        // Para textos (Nome, Categoria, etc)
        if (valorA < valorB) return ordemCrescente ? -1 : 1;
        if (valorA > valorB) return ordemCrescente ? 1 : -1;
        return 0;
    });

    // Inverte a direção para o próximo clique (de A-Z para Z-A)
    ordemCrescente = !ordemCrescente;

    // Devolve as linhas reordenadas para a tabela
    tbody.innerHTML = '';
    linhas.forEach(linha => tbody.appendChild(linha));
}
// ==========================================
// SISTEMA DE LOGOUT / SAIR DA CONTA
// ==========================================
function sairDoSistema() {
    localStorage.clear(); // Rasga o crachá atual
    window.location.reload(); // Recarrega a página, voltando pro login
}
// ==========================================
// CÉREBRO DA CONFIRMAÇÃO PREMIUM (AVISOS)
// ==========================================
function confirmacaoPremium(mensagem) {
    return new Promise((resolve) => {
        document.getElementById('confirmacao-mensagem').innerText = mensagem;
        document.getElementById('modal-confirmacao').style.display = 'flex';

        // Se o usuário clicar em "Sim, Continuar"
        document.getElementById('btn-confirmar-acao').onclick = () => {
            document.getElementById('modal-confirmacao').style.display = 'none';
            resolve(true); // Autoriza a exclusão
        };

        // Se o usuário clicar em "Cancelar"
        window.fecharConfirmacao = () => {
            document.getElementById('modal-confirmacao').style.display = 'none';
            resolve(false); // Aborta a exclusão
        };
    });
}
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('dark-mode', isDark);
    atualizarBotaoDarkMode(isDark);
}

function atualizarBotaoDarkMode(isDark) {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    if (isDark) {
        btn.innerHTML = '<i class="ph ph-sun"></i> <span>Modo Claro</span>';
        btn.classList.add('dark');
    } else {
        btn.innerHTML = '<i class="ph ph-moon"></i> <span>Modo Escuro</span>';
        btn.classList.remove('dark');
    }
}
async function excluirImportacao(id) {
    const confirmou = await confirmacaoPremium("Deseja cancelar e apagar permanentemente esta importação?");

    if (confirmou) {
        try {
            const res = await fetch(`${API_URL}/purchases/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            if (res.status === 401 || res.status === 403) return sairDoSistema();

            if (res.ok) {
                // Inteligência: Registra quem apagou a carga na auditoria
                await registrarAuditoria('🗑️ Importação', `Cancelou a carga/importação ID: ${id}`);
                carregarListaImportacoes();
                mostrarNotificacao("Importação cancelada com sucesso!", "sucesso");
            } else {
                mostrarNotificacao("Erro ao excluir. Verifique suas permissões.", "erro");
            }
        } catch (e) {
            console.error("Erro na exclusão:", e);
            mostrarNotificacao("Falha de conexão com o servidor.", "erro");
        }
    }
}

// ==========================================
// CONTROLE DE VISIBILIDADE DE COLUNAS
// ==========================================
const TABLE_COLUMNS = {
    'products-table': ['Foto', 'Nome', 'SKU', 'Categoria', 'Fornecedor', 'Estoque', 'Ação'],
    'imports-table': ['SKU / Produto', 'Volume', 'Previsão', 'Prioridade', 'Ação'],
    'history-table': ['Data/Hora', 'Funcionário', 'Ação', 'Item', 'Qtd.'],
    'receitas-table': ['Produto Final', 'SKU', 'Categoria', 'Componentes', 'Ações'],
    'orders-table': ['Nome', 'Quantidade Produtos', 'Local de Entrega', 'Fornecedor Escolhido', 'Valor Total', 'Dia do Pedido', 'Dia que foi Enviado']
};

function getColumnVisibilityState(tableId) {
    const saved = localStorage.getItem(`col_vis_${tableId}`);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('Erro ao ler col_vis de localStorage', e);
        }
    }
    const cols = TABLE_COLUMNS[tableId];
    const state = {};
    cols.forEach(col => state[col] = true);
    return state;
}

function saveColumnVisibilityState(tableId, state) {
    localStorage.setItem(`col_vis_${tableId}`, JSON.stringify(state));
}

function applyColumnVisibility(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const cols = TABLE_COLUMNS[tableId];
    const state = getColumnVisibilityState(tableId);
    
    cols.forEach((col, idx) => {
        const isVisible = state[col] !== false; // Default to true if undefined
        if (isVisible) {
            table.classList.remove(`hide-col-${idx}`);
        } else {
            table.classList.add(`hide-col-${idx}`);
        }
    });
}

function toggleColumn(tableId, colName) {
    const state = getColumnVisibilityState(tableId);
    state[colName] = state[colName] === false ? true : false;
    saveColumnVisibilityState(tableId, state);
    applyColumnVisibility(tableId);
    renderColumnDropdown(tableId);
}

function renderColumnDropdown(tableId) {
    const container = document.getElementById(`dropdown-cols-${tableId}`);
    if (!container) return;
    
    const cols = TABLE_COLUMNS[tableId];
    const state = getColumnVisibilityState(tableId);
    
    container.innerHTML = '';
    cols.forEach(col => {
        const isVisible = state[col] !== false; // Default to true if undefined
        const iconClass = isVisible ? 'ph ph-eye' : 'ph ph-eye-slash';
        const opacityStyle = isVisible ? '' : 'opacity: 0.6;';
        
        const item = document.createElement('div');
        item.className = 'columns-dropdown-item';
        item.style = opacityStyle;
        item.onclick = (e) => {
            e.stopPropagation(); // Impede o fechamento do dropdown ao clicar nele
            toggleColumn(tableId, col);
        };
        
        item.innerHTML = `
            <span>${col}</span>
            <i class="${iconClass}" style="color: ${isVisible ? 'var(--primary)' : 'var(--text-muted)'}"></i>
        `;
        container.appendChild(item);
    });
}

function toggleDropdownColumns(tableId, event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById(`dropdown-cols-${tableId}`);
    if (!dropdown) return;
    
    // Fecha outros menus de colunas abertos
    document.querySelectorAll('.columns-dropdown-menu').forEach(menu => {
        if (menu.id !== `dropdown-cols-${tableId}`) {
            menu.style.display = 'none';
        }
    });
    
    if (dropdown.style.display === 'none' || !dropdown.style.display) {
        dropdown.style.display = 'flex';
    } else {
        dropdown.style.display = 'none';
    }
}

// Fechar os menus de coluna ao clicar fora deles
document.addEventListener('click', (e) => {
    if (!e.target.closest('.columns-dropdown-menu') && !e.target.closest('.toggle-columns-btn')) {
        document.querySelectorAll('.columns-dropdown-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
});

// ==========================================
// MÓDULO DE PEDIDOS (KANBAN E LOGÍSTICA)
// ==========================================
async function carregarPedidos() {
    try {
        const res = await fetch(`${API_URL}/orders`, { headers: getAuthHeaders() });
        if (res.status === 401 || res.status === 403) return sairDoSistema();
        
        const pedidos = await res.json();
        const role = localStorage.getItem('userRole');
        
        // Exibir botões de exportar e colunas apenas para Chefe e Gestor (admins)
        const btnNovo = document.getElementById('btn-novo-pedido');
        if (btnNovo) {
            btnNovo.style.display = role === 'admin' ? 'block' : 'none';
        }
        
        const btnExportar = document.getElementById('btn-exportar-pedidos');
        const dropdownColunas = document.getElementById('dropdown-colunas-pedidos-wrapper');
        if (btnExportar) btnExportar.style.display = role === 'admin' ? 'block' : 'none';
        if (dropdownColunas) dropdownColunas.style.display = role === 'admin' ? 'block' : 'none';

        const filaContainer = document.getElementById('fila-pedidos');
        const enviadosContainer = document.getElementById('enviados-pedidos');
        
        filaContainer.innerHTML = '';
        enviadosContainer.innerHTML = '';
        
        let countFila = 0;
        let countEnviados = 0;
        
        pedidos.forEach(p => {
            const card = document.createElement('div');
            card.className = 'pedido-card';
            card.style.cssText = `
                background: var(--bg-color);
                border: 1px solid var(--border);
                border-radius: 8px;
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                transition: transform 0.2s, box-shadow 0.2s;
            `;
            
            // Hover effect
            card.onmouseenter = () => {
                card.style.transform = 'translateY(-2px)';
                card.style.boxShadow = '0 4px 8px rgba(0,0,0,0.05)';
            };
            card.onmouseleave = () => {
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
            };

            const dataCriacao = new Date(p.created_at + (p.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            
            let descHtml = p.description ? `<div style="font-size: 0.85rem; color: var(--text-muted); background: var(--card-bg); padding: 6px 10px; border-radius: 6px; border-left: 3px solid var(--primary); white-space: pre-wrap;">${p.description}</div>` : '';
            
            // Grid de novos detalhes (Qtd, Valor, Transporte)
            let detailsHtml = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem; background: var(--card-bg); padding: 8px; border-radius: 6px; border: 1px solid var(--border); margin: 3px 0;">
                    <div><strong>Qtd:</strong> ${p.total_products || 0} un</div>
                    <div><strong>Valor:</strong> R$ ${(p.total_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <div style="grid-column: span 2;"><strong>Transporte:</strong> ${p.carrier || '<i style="color:var(--text-muted)">Não definido</i>'}</div>
                </div>
            `;

            if (p.status === 'Fila') {
                countFila++;
                
                // Botões de CRUD para Admins
                let adminButtonsHtml = '';
                if (role === 'admin') {
                    // Prepara strings de descrição seguras para escapar aspas simples
                    const descEscaped = (p.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
                    const carrierEscaped = (p.carrier || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    adminButtonsHtml = `
                        <div style="display: flex; gap: 8px; margin-top: 5px;">
                            <button onclick="abrirModalPedido(${p.id}, '${p.client_name.replace(/'/g, "\\'")}', '${p.address.replace(/'/g, "\\'")}', '${descEscaped}', ${p.total_products || 0}, '${carrierEscaped}', ${p.total_value || 0})" class="btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;"><i class="ph ph-pencil"></i> Editar</button>
                            <button onclick="excluirPedido(${p.id})" class="btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; color: #ef4444; border-color: rgba(239,68,68,0.2); flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;"><i class="ph ph-trash"></i> Excluir</button>
                        </div>
                    `;
                }

                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <strong style="color: var(--text-main); font-size: 0.95rem;">${p.client_name}</strong>
                        <small style="color: var(--text-muted); font-size: 0.75rem;">#${p.id}</small>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: flex-start; gap: 4px;">
                        <i class="ph ph-map-pin" style="margin-top: 2px; color: var(--primary);"></i>
                        <span>${p.address}</span>
                    </div>
                    ${descHtml}
                    ${detailsHtml}
                    <div style="font-size: 0.75rem; color: var(--text-muted);"><i class="ph ph-calendar"></i> Criado: ${dataCriacao}</div>
                    
                    <button onclick="confirmarEnvioPedido(${p.id})" class="btn-primary" style="background-color: #10b981; padding: 6px 12px; font-size: 0.85rem; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 5px;"><i class="ph ph-truck"></i> Confirmar Envio</button>
                    <input type="file" id="file-input-order-${p.id}" accept="image/*" style="display: none;" onchange="enviarFotoPedido(${p.id}, this)">
                    ${adminButtonsHtml}
                `;
                filaContainer.appendChild(card);
            } else {
                countEnviados++;
                
                const dataEnvio = new Date(p.shipped_at + (p.shipped_at.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                
                let imgHtml = p.image_url ? `
                    <div class="order-image" style="margin-top: 5px; border-radius: 6px; overflow: hidden; height: 110px; border: 1px solid var(--border); cursor: pointer; position: relative;" onclick="abrirImagemComprovante('${p.image_url}')">
                        <img src="${p.image_url}" style="width:100%; height:100%; object-fit:cover;">
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); color: white; font-size: 0.75rem; text-align: center; padding: 3px 0; display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <i class="ph ph-eye"></i> Ver Comprovante
                        </div>
                    </div>
                ` : '';

                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <strong style="color: var(--text-main); font-size: 0.95rem;">${p.client_name}</strong>
                        <small style="color: var(--text-muted); font-size: 0.75rem;">#${p.id}</small>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: flex-start; gap: 4px;">
                        <i class="ph ph-map-pin" style="margin-top: 2px; color: var(--primary);"></i>
                        <span>${p.address}</span>
                    </div>
                    ${descHtml}
                    ${detailsHtml}
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 3px;"><i class="ph ph-calendar"></i> Criado: ${dataCriacao}</div>
                    <div style="font-size: 0.75rem; color: #10b981; font-weight: 500;"><i class="ph ph-check-circle"></i> Enviado: ${dataEnvio}</div>
                    ${imgHtml}
                `;
                enviadosContainer.appendChild(card);
            }
        });
        
        document.getElementById('count-fila').innerText = countFila;
        document.getElementById('count-enviados').innerText = countEnviados;
        
        if (countFila === 0) {
            filaContainer.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border); border-radius: 8px;">Fila vazia. Nenhum pedido pendente.</div>';
        }
        if (countEnviados === 0) {
            enviadosContainer.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border); border-radius: 8px;">Nenhum pedido enviado nas últimas 2 semanas.</div>';
        }
    } catch (e) {
        console.error("Erro ao carregar pedidos:", e);
        mostrarNotificacao("Erro de conexão ao buscar pedidos.", "erro");
    }
}

function abrirModalPedido(id = null, cliente = '', endereco = '', descricao = '', totalProducts = 0, carrier = '', totalValue = 0) {
    document.getElementById('pedido-id').value = id || '';
    document.getElementById('pedido-cliente').value = cliente;
    document.getElementById('pedido-endereco').value = endereco;
    document.getElementById('pedido-descricao').value = descricao;
    document.getElementById('pedido-total-products').value = totalProducts || '';
    document.getElementById('pedido-carrier').value = carrier;
    document.getElementById('pedido-total-value').value = totalValue || '';
    
    document.getElementById('modal-pedido-titulo').innerText = id ? 'Editar Pedido' : 'Novo Pedido';
    document.getElementById('modal-novo-pedido').style.display = 'flex';
}

function fecharModalPedido() {
    document.getElementById('modal-novo-pedido').style.display = 'none';
    document.getElementById('form-pedido').reset();
}

async function salvarPedido(event) {
    event.preventDefault();
    const id = document.getElementById('pedido-id').value;
    const client_name = document.getElementById('pedido-cliente').value;
    const address = document.getElementById('pedido-endereco').value;
    const description = document.getElementById('pedido-descricao').value;
    const total_products = document.getElementById('pedido-total-products').value;
    const carrier = document.getElementById('pedido-carrier').value;
    const total_value = document.getElementById('pedido-total-value').value;
    
    const url = id ? `${API_URL}/orders/${id}` : `${API_URL}/orders`;
    const method = id ? 'PUT' : 'POST';
    
    try {
        const res = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                client_name, 
                address, 
                description,
                total_products,
                carrier,
                total_value
            })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            fecharModalPedido();
            const acaoAuditoria = id ? `Editou o pedido ID: ${id}` : `Criou um novo pedido para ${client_name}`;
            await registrarAuditoria('📦 Pedidos', acaoAuditoria);
            carregarPedidos();
            mostrarNotificacao(id ? "Pedido atualizado com sucesso!" : "Pedido criado com sucesso!", "sucesso");
        } else {
            mostrarNotificacao(data.error || "Erro ao salvar pedido.", "erro");
        }
    } catch (e) {
        console.error("Erro ao salvar pedido:", e);
        mostrarNotificacao("Erro de conexão com o servidor.", "erro");
    }
}

async function excluirPedido(id) {
    if (await confirmacaoPremium("Deseja realmente excluir este pedido? Esta ação é irreversível.")) {
        try {
            const res = await fetch(`${API_URL}/orders/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (res.ok) {
                await registrarAuditoria('🗑️ Pedidos', `Excluiu o pedido ID: ${id}`);
                carregarPedidos();
                mostrarNotificacao("Pedido excluído do sistema.", "sucesso");
            } else {
                mostrarNotificacao(data.error || "Erro ao excluir pedido.", "erro");
            }
        } catch (e) {
            console.error("Erro ao excluir pedido:", e);
            mostrarNotificacao("Erro de conexão com o servidor.", "erro");
        }
    }
}

function confirmarEnvioPedido(id) {
    const input = document.getElementById(`file-input-order-${id}`);
    if (input) {
        input.value = ''; // Limpa memória
        input.click();
    }
}

async function enviarFotoPedido(id, input) {
    if (!input.files || input.files.length === 0) return;
    
    const file = input.files[0];
    
    // Alerta de carregamento premium
    document.getElementById('notificacao-icone').innerHTML = '<i class="ph ph-cloud-arrow-up" style="color: #3b82f6;"></i>';
    document.getElementById('notificacao-titulo').innerText = "Enviando Comprovante...";
    document.getElementById('notificacao-mensagem').innerText = "Processando e compactando imagem no servidor...";
    document.getElementById('modal-notificacao').style.display = 'flex';
    
    const formData = new FormData();
    formData.append('foto', file);
    
    try {
        const res = await fetch(`${API_URL}/orders/${id}/ship`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        
        const data = await res.json();
        document.getElementById('modal-notificacao').style.display = 'none';
        
        if (res.ok) {
            await registrarAuditoria('🚚 Pedidos', `Confirmou o envio do pedido ID: ${id} e anexou comprovante`);
            carregarPedidos();
            mostrarNotificacao("Envio confirmado e registrado!", "sucesso");
        } else {
            mostrarNotificacao(data.error || "Erro ao processar comprovante.", "erro");
        }
    } catch (e) {
        console.error("Erro ao enviar comprovante:", e);
        document.getElementById('modal-notificacao').style.display = 'none';
        mostrarNotificacao("Erro de conexão ao enviar imagem.", "erro");
    }
}

function abrirImagemComprovante(url) {
    const modal = document.getElementById('modal-comprovante');
    const img = document.getElementById('imagem-comprovante-view');
    if (modal && img) {
        img.src = url;
        modal.style.display = 'flex';
    }
}

function fecharModalComprovante() {
    const modal = document.getElementById('modal-comprovante');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ==========================================
// EXPORTAÇÃO DE PEDIDOS EM CSV
// ==========================================
function abrirModalExportarPedidos() {
    document.getElementById('modal-exportar-pedidos').style.display = 'flex';
}

function fecharModalExportarPedidos() {
    document.getElementById('modal-exportar-pedidos').style.display = 'none';
}

async function processarExportarPedidos(event) {
    event.preventDefault();
    fecharModalExportarPedidos();
    
    const filterStatus = document.getElementById('exportar-pedidos-status').value;
    
    try {
        const res = await fetch(`${API_URL}/orders`, { headers: getAuthHeaders() });
        if (!res.ok) {
            mostrarNotificacao("Erro ao carregar dados dos pedidos para exportação.", "erro");
            return;
        }
        
        let orders = await res.json();
        
        // Aplica o filtro de status selecionado
        if (filterStatus !== 'todos') {
            orders = orders.filter(o => o.status === filterStatus);
        }
        
        if (orders.length === 0) {
            mostrarNotificacao("Nenhum pedido encontrado para o status selecionado.", "erro");
            return;
        }
        
        // Regra de Olhos de Visualização (localStorage)
        const visibility = getColumnVisibilityState('orders-table');
        const allColumns = TABLE_COLUMNS['orders-table'];
        
        // Mapeamento das colunas lógicas do BD para as colunas físicas do CSV
        const columnMappers = {
            'Nome': (o) => o.client_name,
            'Quantidade Produtos': (o) => o.total_products || 0,
            'Local de Entrega': (o) => o.address,
            'Fornecedor Escolhido': (o) => o.carrier || '',
            'Valor Total': (o) => o.total_value || 0,
            'Dia do Pedido': (o) => {
                return new Date(o.created_at + (o.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            },
            'Dia que foi Enviado': (o) => {
                if (!o.shipped_at) return '';
                return new Date(o.shipped_at + (o.shipped_at.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            }
        };
        
        // Filtra colunas visíveis
        const visibleColumns = allColumns.filter(col => visibility[col] !== false);
        
        if (visibleColumns.length === 0) {
            mostrarNotificacao("Selecione pelo menos uma coluna visível nas preferências para exportar.", "erro");
            return;
        }
        
        // Construção do CSV
        const csvRows = [];
        
        // 1. Cabeçalho
        csvRows.push(visibleColumns.map(col => `"${col.replace(/"/g, '""')}"`).join(','));
        
        // 2. Dados
        orders.forEach(order => {
            const rowValues = visibleColumns.map(col => {
                const extractor = columnMappers[col];
                const rawVal = extractor ? extractor(order) : '';
                const valStr = String(rawVal);
                // Escapa aspas para CSV
                return `"${valStr.replace(/"/g, '""')}"`;
            });
            csvRows.push(rowValues.join(','));
        });
        
        const csvContent = csvRows.join('\n');
        
        // Download do arquivo CSV com BOM UTF-8 (\ufeff)
        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Relatorio_Pedidos_${filterStatus}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        await registrarAuditoria('📦 Pedidos', `Exportou planilha de pedidos (${filterStatus})`);
        mostrarNotificacao("CSV baixado com sucesso!", "sucesso");
    } catch (e) {
        console.error("Erro ao exportar CSV de pedidos:", e);
        mostrarNotificacao("Erro de conexão ao exportar planilha.", "erro");
    }
}