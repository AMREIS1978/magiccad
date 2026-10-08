# MagicCAD: requisitos e evolução

Aplicação Windows de arquitetura, gratuita, com IA local, machine learning e leitura/escrita DWG. O objetivo é reduzir trabalho repetitivo e burocracia, mantendo o arquiteto no controlo e produzindo desenhos rigorosos e apresentações de qualidade. Não é uma reprodução integral do AutoCAD nesta versão.

## Contrato de rigor

- O pedido em linguagem natural transforma-se numa proposta estruturada, validada antes de alterar o projeto.
- O motor geométrico é a autoridade para medidas e áreas. O modelo de linguagem/classificador não calcula geometria nem atesta cumprimento legal.
- Unidades e tolerâncias explícitas. No protótipo: inteiros em milímetros; entradas inferiores a 1 mm são recusadas sem arredondamento silencioso; ajuste à grelha de 10 mm opcional (F9); ponteiro livre à precisão de 1 mm. Isto é uma limitação declarada, não uma promessa de precisão ilimitada.
- Medidas das divisões são interiores; as paredes crescem para o exterior. Área mostrada é área útil geométrica da divisão, sem classificação jurídica.
- Cada edição é reversível. Próxima evolução: histórico persistente, autor, origem, proposta, revisão, parâmetros e validação.
- Toda peça desenhada publicada deve identificar revisão do modelo, escala e unidades. Plantas, cortes, alçados, cotas e mapas de áreas devem derivar do mesmo modelo.
- DWG: comparar geometrias e camadas após escrita e reabertura; complementar com testes independentes noutros CADs e versões antes de declarar compatibilidade profissional.
- Proibir perda silenciosa de objetos não suportados. Hoje a importação recusa-os; uma evolução deve conservar objetos originais sem os converter indevidamente.
- Testar fechos, encontros, aberturas, sobreposições, tolerâncias, restrições geométricas, precisão de cotas e escala de impressão antes de uso profissional.

## Separação atual

| Componente | Responsabilidade atual | Evolução |
| --- | --- | --- |
| `core.js` | Geometria e projeto 2D, validação, undo/redo | Modelo semântico de edifício e comandos transacionais |
| `cad.js` | Comandos manuais, coordenadas cartesianas, seleção e enquadramento | Restrições e mais operações CAD |
| `renderer.js` | Vista SVG e ferramentas manuais | Vistas 2D derivadas; vista 3D separada |
| `assistant.js` | Conversa curta e extração de medidas | Planeamento local, esclarecimentos e propostas por etapas |
| `learning.js` e `intent-model.js` | Classificador treinável Naive Bayes | Avaliação maior, modelos locais de linguagem, exemplos corrigidos consentidos |
| `dwg.js` e `native/dwg-write.c` | Adaptador LibreDWG em processo separado | Mais tipos de entidade, objetos preservados e versões testadas |
| Módulo documental futuro | Ainda não implementado | Documentos versionados, requisitos legais e dossiers |

A vista SVG não deve tornar-se a base de dados do projeto. As operações passam sempre pelo modelo. O processo principal restringe o acesso a ficheiros; o renderer não tem acesso a Node.js.

## Evolução 3D e renderização

Os formatos v1, v2 e v3 são estritamente 2D; v2 acrescentou portas associadas a divisões, v3 acrescenta a espessura da folha, moldura e ARC, e lê v1/v2 sem mudar as coordenadas. Implementar migração explícita para um futuro modelo 3D, mantendo os ficheiros antigos:

- Edifício, pisos, níveis/elevacões, espaços, paredes, lajes, coberturas e vãos com identificadores estáveis.
- Coordenadas cartesianas 3D, sistema de referência, unidades/tolerâncias e transformação documentada para a vista 2D. Nos formatos guardados v1/v2/v3, Y interno cresce para baixo; a interface manual 0.3 e a troca CAD transformam-no para coordenadas cartesianas; não tratar isto como coordenadas 3D finais.
- Paredes com eixo/contorno, espessura, altura e materiais; portas e janelas pertencem a paredes. Divisões calculadas a partir de limites verificados.
- Motor geométrico independente, interfaces para operações de sólidos e restrições. Investigar Open CASCADE e a sua licença LGPL antes de integrar; não embutir operações 3D no SVG.
- Adaptadores de vistas produzem planta, corte e alçado do mesmo modelo. Projeções para apresentação nunca alteram dimensões do modelo.
- Vista interativa 3D com Three.js (MIT, candidato) e renderização física através de Blender/Cycles (GPL, candidato) em processo separado. Materiais, luz, câmara e qualidade não substituem as peças técnicas.
- Jobs locais de renderização com progresso, cancelamento, revisão de origem e aproveitamento de resultados anteriores. Nenhum serviço pago obrigatório.
- Interoperabilidade IFC a avaliar com ferramentas livres, preservando classes, pisos e unidades; não declarar suporte IFC antes de testar.

## Conversa e autopilot

O protótipo usa aprendizagem supervisionada para reconhecer intenções e regras explícitas para extrair medidas. Não é um LLM geral nem um arquiteto autónomo. O conjunto de treino inicial é pequeno e não demonstra competência arquitetónica.

Evolução prevista: modelo de linguagem gratuito executado localmente, com licença verificada; respostas estruturadas através de um catálogo de operações; contexto do projeto; pedidos de esclarecimento; simulação/validação de cada lote; diário de ações; pausa e intervenção em qualquer etapa. Sem APIs pagas obrigatórias. O modo automático terá limites de atuação escolhidos pelo utilizador. Cálculos geométricos e validação permanecem fora do modelo aprendido.

## Gestão documental e RJUE — próxima fase

Implementar um módulo autónomo ligado ao projeto por identificador e revisão, sem introduzir regras legais fixas no motor geométrico.

- Processo: município, operação urbanística, procedimento, fase, responsáveis e calendário.
- Documento: tipo, versão, ficheiro, checksum, revisão do projeto de origem, autor, estado, revisão técnica, assinatura quando aplicável e histórico.
- Regra: fonte oficial, artigo/norma, data de publicação, entrada em vigor, fim de vigência, âmbito territorial, procedimento aplicável, evidência necessária e data da verificação humana.
- Lista de verificação versionada com estados: por verificar, em falta, presente, revisto, não aplicável com justificação. Presença de um ficheiro não significa conformidade legal ou aprovação.
- Dossier: índice e conjunto de documentos de uma revisão, com relatório de faltas e consistência entre peças escritas e desenhadas. Validação humana antes de emissão ou submissão.
- Identificar alterações que tornem documentos desatualizados: mudar áreas, pisos ou implantação deve sinalizar peças relacionadas, sem reescrever assinaturas ou documentos submetidos.
- Automatizar tarefas verificáveis: nomenclatura, índice, organização, preenchimento de dados confirmados, controlo de versões e comparação de áreas. Não inventar declarações técnicas, assinaturas ou aprovações.

Antes de codificar requisitos legais, consultar no Diário da República a versão vigente do RJUE (Decreto-Lei n.º 555/99 e alterações), a regulamentação de instrução aplicável, regras municipais e outras normas pertinentes ao caso. Estes requisitos ainda não foram pesquisados nem juridicamente validados nesta tarefa. Município, procedimento e tipo de operação terão de ser fornecidos por processo, não presumidos globalmente.

## Entregas por critérios verificáveis

1. Base atual: aplicação 2D, dimensões explícitas, confirmação/undo, IA local treinável, leitura/escrita de um subconjunto DWG real.
2. CAD arquitetónico: paredes ligadas, vãos, camadas editáveis, snaps, coordenadas/comandos, cotas associativas, escalas, folhas e impressão/PDF; testes de precisão e integração DWG independente.
3. Gestão documental: arquivos/versionamento primeiro; regras RJUE e municipais com fontes e vigência depois, para um procedimento real selecionado.
4. Modelo semântico 3D e geração coordenada das vistas; validar migrações e consistência.
5. Materiais, apresentação e renderização local; evoluir a conversa/autopilot com validação de lotes ao longo destas fases.

Tudo deve usar componentes sem pagamento obrigatório. Distribuir MagicCAD sob GPL-3.0-or-later, incluir licenças e código-fonte exigidos pelos componentes. Gratuito não significa ausência de obrigações de licença nem de requisitos de hardware.

## Incremento 0.3

TRIM usa interseções de segmentos por aritmética inteira BigInt e valida os pontos de corte antes de aplicar. A unidade de introdução de comandos é escolhida na interface; o armazenamento permanece em milímetros. Distância direta em LINE usa a direção apontada pelo cursor. COPY aceita vários destinos.

As portas são dados semânticos relativos a uma divisão: parede, offset ao canto, largura e dobradiça. Geometria única partilhada por seleção/snaps, desenho e exportação. O assistente recebe apenas divisões e IDs selecionados, mantém o pedido em curso, pede um campo em falta de cada vez, oferece respostas clicáveis e propõe confirmação. Continua a usar regras e um classificador local de intenções; não foi integrado um LLM nesta entrega.

## Representação de portas 0.3.1

Geometria partilhada: vão estrutural, molduras com rebaixo, retângulo da folha com espessura e arco de abertura de 90° em torno da dobradiça. O arco é exportado pelo adaptador nativo com a API pública dwg_add_ARC; a releitura compara centro, raio, ângulos e camada além das linhas. Nenhuma curva é discretizada para o DWG. O leitor aceita ARC de 90° alinhado com os eixos e recusa restantes casos. Coordenadas, raios e espessuras permanecem inteiros em mm; os ângulos são graus na aplicação e radianos na API nativa.
