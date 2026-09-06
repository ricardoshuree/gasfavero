# rename_vale_fiado.ps1
# Executa na raiz do projeto: C:\project-claude\erp-gasfavero
# Uso: .\rename_vale_fiado.ps1
# Renomeia "Vale" -> "Fiado" apenas nos labels visiveis ao usuario.
# Valor interno "vale" no banco e tipos TypeScript nao mudam.

$root = "C:\project-claude\erp-gasfavero\frontend\src"
$erros = 0

function Patch($rel, $old, $new) {
    $path = Join-Path $root $rel
    if (-not (Test-Path $path)) {
        Write-Host "  ARQUIVO NAO ENCONTRADO: $rel" -ForegroundColor Red
        $script:erros++
        return
    }
    $content = Get-Content $path -Raw -Encoding UTF8
    if ($content -notlike "*$old*") {
        Write-Host "  TRECHO NAO ENCONTRADO em $rel" -ForegroundColor Yellow
        Write-Host "    Buscado: $old"
        $script:erros++
        return
    }
    $updated = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $updated, [System.Text.Encoding]::UTF8)
    Write-Host "  OK: $rel" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Rename Vale -> Fiado ===" -ForegroundColor Cyan
Write-Host ""

# 1. FormaPagamento.tsx — botao Vale -> Fiado, label campo
Write-Host "1. FormaPagamento.tsx" -ForegroundColor Cyan
Patch "components\Vendas\FormaPagamento.tsx" `
    '{ value: "vale", label: "Vale", icon: Receipt }' `
    '{ value: "vale", label: "Fiado", icon: Receipt }'

Patch "components\Vendas\FormaPagamento.tsx" `
    '<Label htmlFor="vale-numero">Número do vale</Label>' `
    '<Label htmlFor="vale-numero">Número do fiado</Label>'

Patch "components\Vendas\FormaPagamento.tsx" `
    'placeholder="Ex: 123"' `
    'placeholder="Ex: 123"'

# 2. LivroVendasCards.tsx — label do mapa
Write-Host "2. LivroVendasCards.tsx" -ForegroundColor Cyan
Patch "components\LivroVendas\LivroVendasCards.tsx" `
    '  vale: "Vale",' `
    '  vale: "Fiado",'

# 3. recebimento-vale.tsx — titulo e descricao da pagina
Write-Host "3. recebimento-vale.tsx" -ForegroundColor Cyan
Patch "routes\_layout\recebimento-vale.tsx" `
    'Recebimento de Vale' `
    'Recebimento de Fiado'

Patch "routes\_layout\recebimento-vale.tsx" `
    'Consulta e baixa das vendas em vale -- separado da venda em si, essa' `
    'Consulta e baixa das vendas em fiado -- separado da venda em si, essa'

Patch "routes\_layout\recebimento-vale.tsx" `
    'tela e so pra controlar o que ja foi (ou ainda precisa ser) recebido.' `
    'tela e so pra controlar o que ja foi (ou ainda precisa ser) recebido.'

Patch "routes\_layout\recebimento-vale.tsx" `
    'placeholder="Consulta número do vale..."' `
    'placeholder="Consulta número do fiado..."'

Patch "routes\_layout\recebimento-vale.tsx" `
    '"Recebimento de Vale - FastAPI Template"' `
    '"Recebimento de Fiado - FastAPI Template"'

# 4. ValesTable.tsx — cabecalho coluna, texto vazio, paginacao
Write-Host "4. ValesTable.tsx" -ForegroundColor Cyan
Patch "components\RecebimentoVale\ValesTable.tsx" `
    '<TableHead>Vale nº</TableHead>' `
    '<TableHead>Fiado nº</TableHead>'

Patch "components\RecebimentoVale\ValesTable.tsx" `
    '"Nenhum vale encontrado"' `
    '"Nenhum fiado encontrado"'

Patch "components\RecebimentoVale\ValesTable.tsx" `
    'Página {page + 1} de {totalPaginas} · {count} vales' `
    'Página {page + 1} de {totalPaginas} · {count} fiados'

# 5. DetalheValeSheet.tsx — titulos e botoes
Write-Host "5. DetalheValeSheet.tsx" -ForegroundColor Cyan
Patch "components\RecebimentoVale\DetalheValeSheet.tsx" `
    '<SheetTitle>Vale nº {venda.vale_numero ?? "—"}</SheetTitle>' `
    '<SheetTitle>Fiado nº {venda.vale_numero ?? "—"}</SheetTitle>'

Patch "components\RecebimentoVale\DetalheValeSheet.tsx" `
    'Baixa do vale' `
    'Baixa do fiado'

Patch "components\RecebimentoVale\DetalheValeSheet.tsx" `
    'Confirmar baixa' `
    'Confirmar baixa'

Patch "components\RecebimentoVale\DetalheValeSheet.tsx" `
    'para este vale? Essa ação encerra a venda e não pode ser desfeita.' `
    'para este fiado? Essa ação encerra a venda e não pode ser desfeita.'

Patch "components\RecebimentoVale\DetalheValeSheet.tsx" `
    'para este vale? A diferença' `
    'para este fiado? A diferença'

Patch "components\RecebimentoVale\DetalheValeSheet.tsx" `
    '"Vale baixado -- venda encerrada"' `
    '"Fiado baixado -- venda encerrada"'

Patch "components\RecebimentoVale\DetalheValeSheet.tsx" `
    '"Pagamento registrado -- pronto pra dar baixa"' `
    '"Pagamento registrado -- pronto pra dar baixa"'

# 6. ResumoCards.tsx — titulos dos cards e unidade
Write-Host "6. ResumoCards.tsx" -ForegroundColor Cyan
Patch "components\RecebimentoVale\ResumoCards.tsx" `
    'titulo="Vales em aberto"' `
    'titulo="Fiados em aberto"'

Patch "components\RecebimentoVale\ResumoCards.tsx" `
    '{qtd === 1 ? "vale" : "vales"}' `
    '{qtd === 1 ? "fiado" : "fiados"}'

Patch "components\RecebimentoVale\ResumoCards.tsx" `
    'titulo={`Vales pagos: ${mesVigenteLabel()}`}' `
    'titulo={`Fiados pagos: ${mesVigenteLabel()}`}'

# 7. vales.tsx — titulo e descricao da pagina
Write-Host "7. vales.tsx" -ForegroundColor Cyan
Patch "routes\_layout\vales.tsx" `
    '<h1 className="text-2xl font-bold tracking-tight">Bloco de Vale</h1>' `
    '<h1 className="text-2xl font-bold tracking-tight">Bloco de Fiado</h1>'

Patch "routes\_layout\vales.tsx" `
    'Cadastre o intervalo de folhas do bloco -- o motorista ja e' `
    'Cadastre o intervalo de folhas do bloco -- o motorista ja e'

Patch "routes\_layout\vales.tsx" `
    '"Bloco de Vale - FastAPI Template"' `
    '"Bloco de Fiado - FastAPI Template"'

Patch "routes\_layout\vales.tsx" `
    '"Nenhum bloco de vale cadastrado ainda"' `
    '"Nenhum bloco de fiado cadastrado ainda"'

Patch "routes\_layout\vales.tsx" `
    '"Carregando blocos..."' `
    '"Carregando blocos..."'

# 8. AddBlocoVale.tsx — botao e dialog
Write-Host "8. AddBlocoVale.tsx" -ForegroundColor Cyan
Patch "components\Vales\AddBlocoVale.tsx" `
    'Novo Bloco de Vale' `
    'Novo Bloco de Fiado'

Patch "components\Vales\AddBlocoVale.tsx" `
    '<DialogTitle>Novo Bloco de Vale</DialogTitle>' `
    '<DialogTitle>Novo Bloco de Fiado</DialogTitle>'

Patch "components\Vales\AddBlocoVale.tsx" `
    'Informe a primeira e a ultima folha do bloco -- um vale e gerado pra' `
    'Informe a primeira e a ultima folha do bloco -- um fiado e gerado pra'

Patch "components\Vales\AddBlocoVale.tsx" `
    '"Bloco de vale criado com sucesso"' `
    '"Bloco de fiado criado com sucesso"'

# 9. columns.tsx — cabecalho Total de vales
Write-Host "9. columns.tsx" -ForegroundColor Cyan
Patch "components\Vales\columns.tsx" `
    'header: "Total de vales",' `
    'header: "Total de fiados",'

# 10. AppSidebar.tsx — itens do menu
Write-Host "10. AppSidebar.tsx" -ForegroundColor Cyan
Patch "components\Sidebar\AppSidebar.tsx" `
    'title: "Recebimento de Vale"' `
    'title: "Recebimento de Fiado"'

Patch "components\Sidebar\AppSidebar.tsx" `
    'title: "Bloco de Vale"' `
    'title: "Bloco de Fiado"'

Write-Host ""
if ($erros -eq 0) {
    Write-Host "=== Concluido sem erros. ===" -ForegroundColor Green
    Write-Host "Rode: npm run build (em frontend/) para validar antes do commit." -ForegroundColor Yellow
} else {
    Write-Host "=== $erros substituicao(oes) nao encontrada(s) — revise acima. ===" -ForegroundColor Red
}
Write-Host ""
