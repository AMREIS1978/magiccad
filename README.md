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
- Linhas manuais, seleção, eliminação, zoom, deslocação, enquadramento e desfazer/refazer.
- Conversa local curta: reconhece pedidos de divisões e pergunta por medidas em falta. O modelo Naive Bayes é treinado com exemplos em `data/intents.pt.json`; não é um LLM geral.
- Guardar/abrir projetos `.magiccad.json`, com validação e aviso de alterações por guardar.
- DWG real: exportação R2000 de linhas e contornos através da API pública LibreDWG; reabertura e comparação automática de coordenadas/camadas antes de gravar o destino.
- Importação de DWG com LINE/LWPOLYLINE retilíneas 2D e unidades declaradas em mm/cm/m. Outros objetos são recusados para impedir perda silenciosa.

Não exporta nomes, áreas ou cotas visuais para DWG nesta versão. Os contornos importados não recuperam as divisões semânticas; guarda também o projeto MagicCAD. Não há ainda paredes ligadas, portas/janelas, cotas associativas, impressão, LLM geral, autopilot, 3D, renderização ou conformidade RJUE validada.

A geometria atual usa inteiros de 1 mm e limites de ±1000 m; entradas com maior precisão são recusadas. A grelha manual ajusta a 10 mm. As paredes crescem para o exterior das medidas interiores. Estes limites não constituem certificação de rigor profissional.

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

## Evolução

[Arquitetura e requisitos](docs/ARCHITECTURE.md) descreve a separação para modelo 3D, renderização local e futura gestão documental com regras RJUE/municipais versionadas e verificadas. Estas capacidades estão planeadas, não implementadas.

## Verificação inicial

Na máquina Linux de desenvolvimento: testes de geometria/IA/DXF, DWG real, interface e desktop Electron com IPC. O teste desktop automatiza a escolha dos ficheiros, mas executa a gravação/leitura e o conversor reais. Não houve ainda execução no Windows nem comparação com AutoCAD ou outro CAD independente.
