# MagicCAD

Primeira base de uma aplicação desktop de arquitetura para Windows, gratuita e orientada a comandos em português. Usa Electron, um modelo local de machine learning e GNU LibreDWG. Licença GPL-3.0-or-later.

## Abrir no Windows da forma mais simples

1. Descarrega o [ZIP do projeto](https://github.com/AMREIS1978/magiccad/archive/refs/heads/main.zip).
2. Clica com o botão direito no ZIP → **Extrair Tudo**.
3. Abre a pasta extraída `magiccad-main` e faz duplo clique em **INICIAR.cmd**.
4. Aguarda a instalação das dependências e a abertura da aplicação. É necessário Node.js 24 LTS ou superior e Internet para a preparação.

Não é necessário abrir PowerShell para experimentar a aplicação 2D. O suporte DWG exige a preparação adicional descrita abaixo. O arranque nativo no Windows ainda não foi validado nesta máquina Linux; se houver um erro, a janela mantém a mensagem visível.

### Se a instalação mostrar um erro do npm

O ZIP precisa de ser **extraído por completo** antes de abrir `INICIAR.cmd`. Não executes o ficheiro dentro da janela do ZIP nem copies apenas esse ficheiro: o arranque depende de `package.json`, `package-lock.json` e da pasta `src`, na mesma pasta extraída.

O arranque verifica estes ficheiros antes de instalar. Caso o npm falhe depois da extração, envia `magiccad-instalacao.log`, criado na pasta do programa, para identificar a causa completa. A captura apenas das últimas linhas da ajuda do npm não identifica a causa.

## O que já existe

- Divisões retangulares: dimensões interiores explícitas, espessura de paredes, posição, área e cotas visuais.
- Modo manual com linha de comandos: LINE/L, RECTANG/REC, MOVE/M, COPY/CO, OFFSET/O, TRIM/TR, ERASE/E, UNDO/U e REDO; linhas contínuas, coordenadas absolutas/relativas, seleção por janela/crossing, ORTHO, OSNAP e zoom.
- Conversa local curta: reconhece pedidos de divisões e pergunta por medidas em falta. O modelo Naive Bayes é treinado com exemplos em `data/intents.pt.json`; não é um LLM geral.
- Guardar/abrir projetos `.magiccad.json`, com validação e aviso de alterações por guardar.
- DWG real: exportação R2000 de linhas, contornos e arcos de portas através da API pública LibreDWG; reabertura e comparação automática de coordenadas/camadas antes de gravar o destino.
- Importação de DWG com LINE/LWPOLYLINE retilíneas 2D e unidades declaradas em mm/cm/m. Outros objetos são recusados para impedir perda silenciosa.

Não exporta nomes, áreas ou cotas visuais para DWG nesta versão. Os contornos importados não recuperam as divisões semânticas; guarda também o projeto MagicCAD. Não há ainda paredes ligadas, janelas, cotas associativas, impressão, LLM geral, autopilot, 3D, renderização ou conformidade RJUE validada.

A geometria atual usa inteiros de 1 mm e limites de ±1000 m; entradas com maior precisão são recusadas. O ponteiro ajusta à precisão de 1 mm; F9 ativa ajuste à grelha de 10 mm. F3 ativa OSNAP a extremidades e pontos médios representáveis em mm inteiros. As paredes crescem para o exterior das medidas interiores. Estes limites não constituem certificação de rigor profissional.

## Desenvolvimento

Requisitos: Node.js 24 LTS, npm e, para DWG, compilador C e CMake 3.x. Usa o checkout existente; não é necessário um worktree.

```sh
npm ci
npm run train:ai
npm test
npm start
```

Treinar reescreve intencionalmente `src/intent-model.js`. Rever os exemplos e os resultados antes de alterar o modelo. Não treinar com projetos ou dados pessoais sem autorização.

### Ambiente de nuvem Linux

```sh
bash scripts/setup-cloud.sh
npm run test:dwg
npm run test:ui
bash scripts/setup-display.sh
PATH=/workspace/.tools/xvfb/usr/bin:$PATH LD_LIBRARY_PATH=/workspace/.tools/xvfb/usr/lib/x86_64-linux-gnu xvfb-run -a npm run test:desktop
```

O script instala ferramentas em `/workspace/.tools`, dependências no checkout e cache fora do repositório. Requer acesso HTTPS ao GitHub, registry.npmjs.org, pypi.org e files.pythonhosted.org; mantém TLS e checksums. A aplicação desktop necessita de uma sessão gráfica. `setup-display.sh` prepara Xvfb localmente a partir de pacotes Debian verificados, sem instalação no sistema. O teste desktop na nuvem usa `--no-sandbox` apenas nesse processo de teste, porque o sandbox Linux não está disponível nesta máquina; a aplicação Windows mantém o renderer isolado e o sandbox configurado. O teste de UI usa Chromium headless instalado em `/usr/bin/chromium` ou `CHROMIUM_PATH`; não é uma versão web do produto.

### Windows

Instala gratuitamente Node.js 24 LTS, Git, CMake 3.x e Visual Studio Build Tools com a carga de trabalho C++. Na Developer PowerShell:

```powershell
npm ci
powershell -ExecutionPolicy RemoteSigned -File scripts/setup-windows.ps1
npm start
```

A preparação compila LibreDWG 0.13.4 e o adaptador nativo a partir do código-fonte fixado, em pastas ignoradas. Alternativamente, `LIBREDWG_BIN` pode apontar para uma pasta com `dwg2dxf.exe` e `magiccad-dwg-write.exe` construídos desta forma.

```powershell
npm run test:dwg
npm run package:windows
```

O pacote é criado em `dist/`. A execução e a compilação nativas no Windows ainda precisam de validação numa máquina Windows. Não distribuir o pacote como produto profissional antes dessa validação e de testes de compatibilidade em CAD independente. Incluir código-fonte/licenças de LibreDWG e demais componentes ao distribuir.

## Exemplos

- `Cria uma divisão de 4 x 5 metros com paredes de 20 cm`
- `Desenha uma sala de 4 por 5 metros, com paredes de 20 cm`
- `Preciso de um quarto de 3,5 x 4 m` → pede espessura; responde `paredes de 15 cm`.
- `desfazer`, `refazer`, `cancelar`.

Os comandos preparam uma proposta; revê as medidas e a posição e seleciona **Aplicar à planta**. O botão **Divisão** permite introduzi-las diretamente. Roda do rato: zoom; botão do meio: deslocar; Esc: cancelar; Ctrl+Z: desfazer; Ctrl+S: guardar.

## Operação manual — versão 0.3

O botão **Manual** dá prioridade à área de desenho. O botão **Assistente IA** mostra a conversa. A linha de comandos manual fica por baixo do desenho, com instruções para o passo atual.

| Ação | Comando ou atalho |
| --- | --- |
| Ver limites e todo o desenho | **ZOOM ALL**, `Z A` ou `Z` → Enter → `A` → Enter |
| Enquadrar apenas o desenho | **ZOOM EXTENTS**, `Z E`, ou duplo clique no botão do meio |
| Linha contínua | `L` → Enter → primeiro ponto → pontos seguintes → Enter termina; `C` fecha; `U` desfaz o último segmento |
| Retângulo | `REC` → Enter → dois cantos; desfaz-se numa única operação |
| Mover | `M` → Enter → selecionar e Enter (se necessário) → ponto base → destino |
| Aparar linhas | `TR` → Enter → selecionar limites → Enter → clicar no trecho a remover; Enter sem limites usa todos; U desfaz; Enter termina |
| Porta numa divisão | Botão **Inserir porta**, ou pede ao assistente; confirma divisão, parede, largura, posição e dobradiça |
| Apagar | `E` → Enter → selecionar objetos → Enter confirma |
| Desfazer/refazer | `U`, `REDO`, Ctrl+Z / Ctrl+Y |
| Ortho / object snap / grelha | F8 / F3 / F9 |
| Cancelar e desmarcar | Esc |
| Repetir o último comando manual | Enter ou Espaço quando a linha de comandos está vazia |

Pontos manuais são cartesianos, na unidade escolhida em **Medidas** (mm por defeito): `4000,5000` representa X=4 m e Y=5 m; Y positivo cresce para cima. Com Medidas=m, `4,5` representa X=4 m e Y=5 m. Os sufixos continuam disponíveis: `4m,5m`. Em LINE, aponta o cursor na direção pretendida e escreve a distância; F8 restringe a direção aos eixos. Coordenadas relativas: `@4000,0`; polares: `@4m<90`. Nesta precisão, coordenadas polares que produzam frações de milímetro são recusadas. Para decimais com vírgula usa ponto e vírgula como separador de eixos: `1,5m;2m`.

Seleciona por clique ou por arrasto: esquerda→direita exige inclusão total; direita→esquerda seleciona objetos cruzados. Shift remove da seleção; Ctrl+A na área de desenho seleciona todos. O botão do meio faz pan e a roda faz zoom ao cursor. A roda não cancela a linha em curso.

A conversa aceita Enter para enviar e Shift+Enter para nova linha. Exemplos: `quero uma sala de quatro por cinco metros com paredes de vinte cm`; ou `quero uma sala de 4x5` → indicar `metros` → indicar `20 cm`. A IA local continua específica: não é um LLM geral, nem executa um projeto completo autónomo. O modo manual segue princípios conhecidos do CAD, mas **não tem ainda todas as ferramentas nem compatibilidade integral de operação com AutoCAD**.

O formato guardado v3 continua a conservar Y interno para baixo, para manter os projetos anteriores. A interface manual, a posição de divisões e a troca DWG apresentam coordenadas cartesianas por transformação; os projetos v1/v2 são migrados em memória para v3, sem alterar as coordenadas nem reescrever o ficheiro original. A versão v3 impede que versões antigas descartem a espessura da folha, a moldura e os arcos ao abrir o projeto.

## Evolução

[Arquitetura e requisitos](docs/ARCHITECTURE.md) descreve a separação para modelo 3D, renderização local e futura gestão documental com regras RJUE/municipais versionadas e verificadas. Estas capacidades estão planeadas, não implementadas.

## Verificação inicial

Na máquina Linux de desenvolvimento: testes de geometria/IA/DXF, DWG real, interface e desktop Electron com IPC. O teste desktop automatiza a escolha dos ficheiros, mas executa a gravação/leitura e o conversor reais. Não houve ainda execução no Windows nem comparação com AutoCAD ou outro CAD independente.

### Copiar e criar paralelas

- **CO / COPY / COPIAR**: seleciona os objetos, indica o ponto base e o destino. `@6000,0` copia 6 m para a direita. Os originais são preservados. COPY permite indicar vários destinos a partir do mesmo ponto base; Enter termina e U desfaz.
- **O / OFFSET**: indica a distância (`200` = 200 mm ou `20cm`), seleciona uma linha e Enter, depois indica um ponto do lado pretendido. Com uma linha já selecionada, passa diretamente ao lado após a distância.

OFFSET suporta linhas e recusa resultados que não possam ser representados exatamente na precisão de 1 mm. Não arredonda coordenadas nem altera o original. Círculos, cotas editáveis e ligação a modelos de conversa locais continuam em desenvolvimento.

### Portas e assistente cooperante — 0.3

Depois de criar uma divisão, o assistente sugere inserir uma porta, copiar ou enquadrar. Usa a divisão selecionada como contexto e mostra respostas clicáveis. `Inserir uma porta` → `90 cm` → `Parede superior` → `A 1 metro do canto` → `Dobradiça no fim` prepara a confirmação. As medidas são sempre explícitas. Uma proposta inválida pede correção e não altera o projeto.

As portas pertencem às divisões MagicCAD; criam um vão real entre os contornos da parede, ombreiras e folha com espessura, molduras com rebaixo e arco verdadeiro a 90° para o interior. A posição mede-se desde o canto interior esquerdo nas paredes horizontais ou superior nas verticais. Não há ainda portas em linhas DWG importadas, janelas ou ligação entre paredes adjacentes. São recusados vãos sobrepostos, fora da parede ou folhas que não caibam no interior. Mover/copiar a divisão preserva as portas; desfazer, guardar e reabrir também. No DWG exportam-se os contornos do vão, a moldura, a folha com espessura e o arco ARC; a importação restitui linhas e arcos de 90° alinhados com os eixos, sem reconstruir a semântica da porta.

TRIM atua em segmentos de linha; pode usar contornos de divisões como limites, mas não corta a divisão paramétrica. Suporta interseções dentro dos segmentos, sem prolongamento implícito. Interseções fracionárias em milímetros são recusadas. A operação manual aproxima-se dos fluxos CAD clássicos, mas não é compatibilidade integral com AutoCAD.

### Representação de portas — 0.3.1

A largura indicada é o **vão na alvenaria**. A folha mede esse vão menos duas larguras de moldura: um vão de 900 mm com molduras de 30 mm corresponde a 840 mm entre molduras. A espessura da folha (40 mm por defeito) e a largura da moldura (30 mm por defeito) podem ser alteradas na confirmação. A moldura tem um rebaixo; a folha aberta é um retângulo, e o arco liga as posições fechada e aberta em torno da dobradiça. As oito combinações de parede/dobradiça usam a mesma geometria.

Os projetos antigos continuam a abrir; portas sem esses campos recebem os valores predefinidos indicados. No DWG o arco é uma entidade ARC, sem aproximação por segmentos. Para usar o novo exportador no Windows, recompila o adaptador com `scripts/setup-windows.ps1`; o executável nativo anterior não conhece o protocolo de arcos. TRIM continua limitado a limites lineares; a seleção explícita de arcos como limites é recusada. ARC importado pode ser selecionado, movido, copiado, apagado e exportado, mas só são suportados quartos de círculo alinhados com os eixos.
