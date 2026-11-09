# FastFlow — Plano de melhoria de informação de impacto

Nov 9, 2026 · @Francisco Maik Fonseca Nunes

## Contexto e problema

Hoje o FastFlow mostra que algo aconteceu, mas não diz quanto melhorou ou piorou, nem onde. As três telas contam eventos (inversões, veículos redirecionados, retidos), mas nenhuma compara o estado antes e depois de uma mudança. Este plano define que informação cada tela precisa exibir para responder à pergunta do operador: o que muda se eu fizer X em vez de Y?

A causa é estrutural, não só de interface:

| Limitação atual | Onde está no código | Consequência para quem usa |
| --- | --- | --- |
| Tempo médio de viagem é uma média acumulada desde o início | `Simulacao.estatisticas()` | O efeito de uma mudança se dilui entre viagens antigas e novas |
| Destino de cada veículo é sorteado a cada viagem | `motor/simulacao.js` | Duas rodadas iguais dão números diferentes; o ruído esconde o efeito |
| Custo do trecho é fixo (comprimento ÷ velocidade) | `adaptador/carregarMalha.js` | Não há congestionamento; o fluxo não migra; uma inversão sempre parece barata |
| Indicadores contam eventos, não consequências | Painéis de Indicadores | O operador sabe quantos foram afetados, não quanto nem onde |
| Tempos e distâncias da Contingência são texto fixo | `js/contingencia.js` | O número exibido pode não bater com a rota desenhada |
| Nenhum estado é salvo ou exportado | Todas as telas | Não dá para comparar alternativas nem levar o resultado para uma reunião |

## Princípios de informação de impacto

Toda informação de impacto, em qualquer tela, segue cinco regras. Elas valem como critério de revisão para cada item deste plano.

1. **Sempre contra uma base.** Todo número aparece como base → cenário → diferença (por exemplo: 4 min 12 s → 4 min 50 s, +38 s, +15%). Um número isolado não é impacto.
2. **Mesma demanda dos dois lados.** A base e o cenário usam os mesmos pares origem→destino e a mesma semente aleatória. A diferença passa a vir só da mudança feita.
3. **Responder quanto, onde e quem.** Quanto: a variação média e o pior caso. Onde: os trechos que ganham ou perdem fluxo, pintados no mapa. Quem: as regiões ou cruzamentos que pioram ou perdem acesso.
4. **Prévia antes de confirmar.** O impacto estimado aparece ao selecionar a ação, antes do clique de confirmação, para que o operador decida com o dado na mão.
5. **Mostrar a confiança.** Cada resultado indica o tamanho da amostra e se a diferença é maior que o ruído normal. Uma variação dentro do ruído aparece como “sem efeito perceptível”, e não como ganho ou perda.

**Vocabulário comum de indicadores** (o mesmo nome e a mesma unidade em todas as telas):

| Indicador | Definição | Unidade |
| --- | --- | --- |
| Tempo médio de viagem | Média das viagens da amostra fixa, na janela comparada | min:s |
| Distância média | Média do comprimento das rotas da amostra | m |
| Viagens afetadas | % dos pares origem→destino cuja rota muda | % |
| Pior caso | Par com o maior aumento de tempo, mostrado no mapa | s e % |
| Perda de acesso | Cruzamentos que deixam de alcançar ou de ser alcançados pela malha principal | contagem |
| Variação de fluxo por trecho | Passagens no cenário menos passagens na base | veículos e % |
| Quilômetros rodados | Soma das distâncias percorridas por todos os veículos | km |
| Retidos | Veículos sem rota possível | contagem |

## Fundações compartilhadas no motor

Cinco peças no motor sustentam todas as telas e precisam vir antes da interface. Cada uma ficaria em `js/motor/` ou `js/adaptador/`, mantendo a separação atual entre motor e tela e com testes em `tests/motor/`.

| # | Peça | O que faz | Reaproveita | Esforço |
| --- | --- | --- | --- | --- |
| F1 | Demanda fixa | Gera uma matriz de N pares origem→destino com semente fixa, por região. Os veículos passam a sortear viagens dessa matriz, e não destinos livres | Gerador aleatório já injetável em `Simulacao` (`aleatorio`) | Baixo |
| F2 | Avaliador analítico | Para uma mudança hipotética, calcula a rota de cada par com e sem a mudança e devolve os indicadores do vocabulário comum. Não anima nada e responde em menos de 1 s | `menorCaminho`, `alcancaveis`, `maiorComponenteForte` e o conjunto `ignorar` já usado em `validarBloqueio` | Médio |
| F3 | Modelo de mudança | Representa qualquer intervenção como objeto: bloquear, inverter, adicionar ligação, lombada, semáforo. Aplicável e reversível em uma cópia do grafo | `bloquearTrecho`, `inverterSentido`, `adicionarAresta` | Médio |
| F4 | Congestionamento | O custo do trecho cresce com a ocupação (função BPR: tempo = tempo livre × (1 + 0,15 × (volume/capacidade)⁴)). As rotas são recalculadas a cada intervalo | Peso das arestas e contagem de veículos por aresta já existentes | Alto |
| F5 | Cenários salvos | Um cenário = região + lista de mudanças + semente. Fica salvo no navegador, pode ser exportado e importado em JSON e permite gerar um relatório | `adaptador/locais.js` já usa `localStorage` | Médio |

O F2 é a peça central. Ele dá números determinísticos e instantâneos, e pode ser construído antes do F4. Com o F4 ativo, o mesmo avaliador passa a considerar o congestionamento, porque os pesos das arestas já vêm carregados.

## Tela Inversão de Sentido

A tela passa a mostrar, antes do R, o custo e o ganho da inversão, e depois do R, o efeito medido em comparação com a base. Hoje a aba Indicadores mostra cinco contadores de eventos e um aviso de conectividade.

**Pergunta que a tela deve responder:** inverter esta via melhora ou piora a circulação, para quem e onde?

| Informação nova | Onde aparece | Responde | Depende de |
| --- | --- | --- | --- |
| Prévia de impacto: viagens afetadas, variação do tempo médio e da distância média, pior caso | Cartão “Se inverter…” na aba Vias, logo acima do botão Inverter | Vale a pena? | F1, F2 |
| Comparação entre os sentidos possíveis (mão dupla, →, ←) lado a lado | Mesmo cartão, uma coluna por sentido, com o melhor destacado | Qual sentido é melhor? | F2 |
| Mapa de variação de fluxo (vermelho = recebe mais, verde = alivia) | Camada no mapa, ligada pela prévia e mantida após a inversão | Para onde o trânsito vai? | F2 |
| Perda de acesso: cruzamentos que ficam isolados ou sem saída, com destaque no mapa | Alerta no cartão, substituindo o atual “Rede viária íntegra” | Alguém fica preso? | F2 (já há `maiorComponenteForte`) |
| Desvio extra para moradores: aumento de percurso para os pares que começam ou terminam na própria via | Linha no cartão | Quem mora ali perde quanto? | F2 |
| Painel Base × Atual após inverter: tempo médio, km rodados, retidos, viagens concluídas | Aba Indicadores, substituindo os contadores soltos | O efeito se confirmou? | F1 |
| Registro com impacto: cada linha do log ganha a variação estimada (+38 s, 12% das viagens) e um botão Desfazer | Aba Indicadores → Registro | O que eu fiz e quanto custou? | F2, F3 |
| Efeito da política: quantos veículos concluíram a travessia e quanto tempo a via levou para esvaziar | Aba Política | Qual política é mais segura? | Eventos já emitidos (`sentidoReagido`) |
| Sugestão automática: as 5 inversões da região com maior ganho de tempo médio | Nova seção “Oportunidades” na aba Vias | Onde inverter faria diferença? | F2 em lote (todos os trechos) |

Exemplo do cartão de prévia:

```
Se inverter Rua X (trecho 3)          Mão dupla → Sentido →
Viagens afetadas        12% (61 de 500)
Tempo médio             4:12 → 4:50   +38 s (+15%)
Distância média         1.840 → 2.050 m   +210 m
Pior caso               Rua A → Rua B   +3 min 10 s
Acesso                  2 cruzamentos ficam sem saída
Carga extra em          Av. Y (+34%), Rua Z (+21%)
```

Critério de aceite: ao selecionar qualquer trecho, a prévia aparece em menos de 1 s e dá o mesmo resultado em duas leituras seguidas.

## Tela Bloqueio Viário e dispositivos

A tela já tem a regra mais madura (recusar bloqueios que prendem veículos) e o painel de impacto mais completo. O que falta é transformar “veja o que acontece” em “quanto custa, comparado a não fazer nada”, para os bloqueios e também para lombadas e semáforos.

**Pergunta que a tela deve responder:** qual é o custo desta interdição ou deste dispositivo, e qual combinação de desvios ou dispositivos o reduz?

**Bloqueio**

| Informação nova | Onde aparece | Responde | Depende de |
| --- | --- | --- | --- |
| Prévia do bloqueio: viagens afetadas, variação do tempo médio, pior caso e rotas de desvio mais usadas | Cartão em Ações de via, antes de Bloquear | Quanto custa interditar aqui? | F1, F2 |
| Motivo de recusa no mapa: os veículos e a área que ficariam presos, destacados | Mapa + mensagem atual, que hoje só tem texto | Por que não posso bloquear? | `validarBloqueio` já devolve `veiculosPresos` |
| Custo acumulado de todos os bloqueios ativos, e de cada um isolado | Lista Vias bloqueadas: variação por item + total | Qual bloqueio pesa mais? | F2, F3 |
| Desvio recomendado: qual inversão ou ligação mais reduz o custo do bloqueio | Sugestão abaixo da prévia, com botão “Testar” | Como reduzir o impacto? | F2 em lote |
| Horário e duração: impacto com a demanda de pico e fora do pico | Seletor de período na prévia | Em que horário fazer a obra? | F1 com perfis de demanda, F4 |

**Lombadas e semáforos**

| Informação nova | Onde aparece | Responde | Depende de |
| --- | --- | --- | --- |
| Velocidade média no trecho, antes e depois do dispositivo | Pop-up do dispositivo + aba Dispositivos | A lombada reduz a velocidade de fato? | Velocidade já calculada por veículo |
| Fila máxima e média (veículos e metros) e tempo médio de espera no semáforo | Pop-up do semáforo, atualizado ao vivo | Os tempos de fase estão bons? | Fila já modelada (`DISTANCIA_SEGURANCA_FILA`) |
| Transbordo: alerta quando a fila alcança o cruzamento anterior | Alerta no mapa e no painel | O semáforo trava a rede? | Comprimento da aresta vs. fila |
| Fuga de rota: veículos que passaram a evitar a via por causa do dispositivo | Aba Dispositivos | O dispositivo empurra trânsito para ruas residenciais? | F4 (sem congestionamento, ninguém desvia) |
| Teste de tempos: comparar 2 ou 3 planos de fase lado a lado (ex.: 12/3/10 vs. 20/3/15) | Pop-up do semáforo, botão “Comparar planos” | Qual plano de fase usar? | F1, F3 |

Critério de aceite: todo bloqueio e todo dispositivo mostra a variação de tempo médio em relação à base, e a lista de bloqueios mostra o total combinado.

## Tela Contingência

A Contingência deixa de ser um catálogo de 7 cenários com números digitados e passa a calcular as rotas a partir dos bloqueios reais da simulação. Hoje o “+4 min” de cada desvio é texto fixo em `js/contingencia.js`. A distância e a duração que o script `gerar-rotas-contingencia.mjs` já calcula pelo OSRM não chegam à tela.

**Pergunta que a tela deve responder:** dado o que está interditado agora, qual rota a equipe deve seguir e quanto ela perde?

| Informação nova | Onde aparece | Responde | Depende de |
| --- | --- | --- | --- |
| Tempo e distância calculados, não digitados: usar `distanciaM` e `duracaoS` do arquivo de rotas como correção imediata | Cartões de rota | O número bate com o traçado? | Nada novo: dado já existe em `rotas-contingencia.json` |
| Rotas a partir dos bloqueios ativos: origem e destino livres, rotas recalculadas na malha com os bloqueios da tela Bloqueio Viário | Formulário Planejar rota | Qual o melhor caminho agora? | F2, F5 (cenário compartilhado entre telas) |
| Composição do atraso: quanto vem da distância extra, quanto de semáforos e lombadas, quanto de congestionamento | Barra empilhada em cada cartão | Por que o desvio é mais lento? | F4 para a parcela de congestionamento |
| Robustez da rota: quantos trechos críticos ela usa (aqueles cujo bloqueio a derrubaria) | Selo “robusta / frágil” no cartão | Este desvio é confiável? | F2 testando cada trecho da rota |
| Impacto do desvio na malha: quanto trânsito extra a rota recomendada joga sobre outras vias | Mapa + nota no cartão | Desviar a equipe piora para os outros? | F4 |
| Comparativo exportado: rota principal × desvios, com mapa e números, em PDF ou imagem | Botão “Gerar resumo” | Como levo isso para a equipe? | F5 |

Critério de aceite: nenhum tempo ou distância exibido é texto fixo, e criar um bloqueio na tela Bloqueio Viário muda a rota recomendada na Contingência.

## Visão transversal: cenários e nova ligação viária

As três telas passam a editar um mesmo cenário, e uma nova área compara cenários entre si. Isso resolve o “X ou Y” de verdade: o operador monta “bloqueio + inversão da Rua A” e “bloqueio + ligação nova na Rua B” e vê qual é melhor.

**Cenário compartilhado (F5)**

- Uma barra fixa no topo de todas as telas mostra o nome do cenário ativo, o número de mudanças e a variação total do tempo médio em relação à base (por exemplo: “Obra Av. Abdalla · 3 mudanças · +52 s”).
- Bloqueios, inversões, dispositivos e ligações feitos em qualquer tela entram no mesmo cenário e aparecem nas outras.
- O cenário sobrevive ao recarregar a página e pode ser duplicado para criar uma variante.

**Comparador de cenários (nova tela ou aba)**

| Informação | Formato |
| --- | --- |
| Base × Cenário A × Cenário B nos indicadores do vocabulário comum | Tabela com a diferença de cada cenário em relação à base e o melhor destacado |
| Mapa de diferença entre dois cenários | Dois mapas sincronizados, ou um mapa com a variação de fluxo por trecho |
| Contribuição de cada mudança para o resultado total | Gráfico em cascata: base → +bloqueio → −inversão → −ligação → cenário |
| Quem ganha e quem perde por região ou bairro | Lista de regiões com a variação de tempo de quem sai ou chega nelas |
| Relatório | Exportar em PDF com mapas, tabela e lista de mudanças |

**Nova ligação viária (adicionar uma rua)**

1. Ferramenta “+ Ligação” na barra do mapa, ao lado de + Lombada e + Semáforo.
2. O operador clica em dois cruzamentos. O encaixe magnético que já existe em `geometriaSnap.js` prende cada ponta ao nó mais próximo.
3. Escolhe mão dupla ou única e a velocidade. O comprimento vem da geometria.
4. A prévia (F2) mostra: tempo economizado, viagens que passariam a usar a ligação, vias aliviadas, áreas reconectadas e, com F4 ativo, se a ligação piora o total (paradoxo de Braess).
5. Opcional: o modo “Onde construir?” testa ligações candidatas entre cruzamentos próximos (por exemplo, a menos de 300 m) e ordena pelo ganho.

Critério de aceite: dois cenários com as mesmas mudanças dão os mesmos números, e a soma das contribuições na cascata fecha com o total, ou a diferença de interação entre mudanças aparece explicitamente.

## Roadmap em fases

A Fase 1 sozinha já resolve o incômodo principal na Inversão de Sentido e corrige os números fixos da Contingência. Cada fase só começa quando a anterior passa no seu portão.

&#91;embedded content: Roadmap · 4 fases, cada uma com seu portão de aceite\]

As Fases 1 e 2 entregam a visão de impacto em todas as telas. As Fases 3 e 4 aprofundam: a 3 compara alternativas e a 4 torna os números mais críveis. A Fase 4 pode começar em paralelo à 3 se houver dados de demanda disponíveis.

## Limites, riscos e como comunicar incerteza

Mesmo com o plano completo, os números mostram direção e ordem de grandeza, não uma previsão do trânsito real. Enquanto não houver dados reais de demanda, o principal risco é alguém tratar “+38 s” como fato.

| Risco | Mitigação |
| --- | --- |
| Demanda irreal: pares origem→destino uniformes ignoram polos como centro, distrito industrial e escolas | Ponderação por tipo de via e por polos marcados no `locais.json`; depois, contagens de tráfego da prefeitura, se houver acesso |
| Falsa precisão: diferenças pequenas exibidas como ganho ou perda | Arredondar (s para min a partir de 60 s), mostrar o tamanho da amostra e marcar “dentro do ruído” quando a diferença for menor que a variação entre sementes |
| Sem congestionamento (antes do F4), as inversões e os bloqueios parecem baratos | Aviso fixo no cartão de prévia: “Sem efeito de congestionamento” até o F4 entrar |
| Desempenho: o avaliador em lote (sugestões, “Onde construir?”) pode travar a tela no Polvilho, a maior malha | Rodar em Web Worker, limitar a amostra e mostrar progresso |
| Calibração do F4: os parâmetros BPR e as capacidades por tipo de via são estimativas | Expor os parâmetros em um arquivo de configuração e documentar os valores usados |
| Escopo: o plano cresce para um simulador profissional | Manter o foco em decisão comparativa, não em previsão; Fases 1 e 2 já entregam o essencial |

**Regra de comunicação na interface:** todo painel de impacto mostra uma linha fixa com “Simulação comparativa · amostra de N viagens · demanda estimada” e um link para a explicação no Guia de uso.

**Pergunta em aberto:** existem contagens de tráfego ou dados de origem→destino de Cajamar disponíveis para calibrar a demanda?

## Status Nov 2026

Snapshot após a implementação multi-agente (branch `cursor/nielsen-p0-consistencia-confirmacoes`; plano `.md` restaurado; ainda sem commit destas sobras).

### DONE

- **F1–F5** no motor: `demandaFixa`, `avaliadorImpacto`, `mudanca`, `congestionamento`/`bprConfig`, `cenario` + persistência/`barraCenario`
- Prévia e painéis de impacto nas telas (inversão, bloqueio, dispositivos, ligação) + Contingência com métricas calculadas
- Comparador de cenários (`pagina4` / `comparadorCenarios`) com export HTML
- **Planos de fase do semáforo** — comparar 2–3 planos (V/A/Vm) no pop-up (`compararPlanosFase` + UI)
- **“Onde construir?”** — candidatos <300 m ranqueados por ganho F2 (`oportunidadesLigacao` / `painelOndeConstruir`)
- **Pico / fora de pico** na prévia de bloqueio — seletor de período (perfis F1) no card “Se bloquear…”
- **BPR analítico na prévia de bloqueio** — checkbox “Incluir congestionamento (BPR)” (aproximado via fluxo OD; não muta o grafo vivo)
- **Comparador PDF + mapa de diferença** — “Gerar PDF” via HTML + Imprimir do navegador; **um** mapa de variação de fluxo (Base→A / Base→B / A→B), em vez de dois mapas sincronizados
- **Contingência — Gerar resumo / PDF** — export comparativo rota principal × desvios (`contingenciaResumo`: HTML imprimível + SVG do mapa + números); botões em `pagina3` no mesmo padrão do comparador
- Plano `.md` restaurado neste repositório

### TODO (sobras restantes)

- (Opcional) PDF nativo com lib — comparador e contingência usam diálogo de impressão do browser, não gerador PDF embutido
- (Opcional) Web Worker / progresso para “Onde construir?” em malhas grandes (Polvilho)
