# Guia de uso do FastFlow

Este guia explica, passo a passo, como usar o FastFlow pela primeira vez: o que cada tela mostra, o que cada botão faz e como simular o bloqueio de uma via. Não é preciso saber programação para acompanhar.

---

## 1. O que é o FastFlow

O FastFlow é um aplicativo web de **simulação de tráfego**. Ele mostra um mapa da cidade com veículos virtuais circulando pelas ruas. Na tela de bloqueio viário você pode **interditar uma via**, como se houvesse uma obra ou um acidente, e acompanhar na hora o que acontece com o trânsito:

- quais veículos precisam mudar de caminho;
- se algum veículo fica sem saída;
- quanto o tempo médio das viagens aumenta.

A região simulada é o **centro de Cajamar (SP)**, com as ruas reais tiradas do OpenStreetMap.

> **Importante:** tudo é uma simulação. Bloquear uma via no FastFlow não afeta o trânsito real nem nenhum outro sistema.

---

## 2. O que você precisa

| Item | Para quê |
|---|---|
| Um navegador atualizado (Chrome, Edge ou Firefox) | Abrir o aplicativo |
| Conexão com a internet | Carregar o mapa de fundo |
| Tela de computador (recomendado) | O aplicativo funciona no celular, mas o painel fica abaixo do mapa e exige rolagem |
| Permissão de localização (opcional) | Só na Página 1, para o mapa centralizar onde você está |

## 2.1. Acesso demonstrativo

Ao abrir o FastFlow, entre com as credenciais de demonstração:

- **E-mail:** `demo@fastflow.com`
- **Senha:** `FastFlow2026!`

A sessão fica salva neste navegador até você selecionar **Sair**. As credenciais são configuradas em `js/auth.config.js`; altere esse arquivo para outro ambiente demonstrativo. Esta autenticação é apenas um mock no navegador e não deve ser usada para proteger dados ou sistemas em produção.

---

## 3. Estrutura das telas

Todas as telas têm a mesma organização:

```
┌───────────────────────────────────────────────────────────────┐
│ FastFlow           Página 1 | Bloqueio Viário | Contingência │  ← Menu superior
├──────────────┬────────────────────────────────────────────────┤
│              │                                                │
│  Painel      │                    Mapa                        │
│  lateral     │                                                │
│              │                                                │
└──────────────┴────────────────────────────────────────────────┘
```

- **Menu superior:** troca de tela. A tela aberta fica destacada em azul.
- **Painel lateral (esquerda):** opções e informações da tela.
- **Área central:** o mapa.
- **Ajuda contextual:** passe o mouse ou leve o foco do teclado a um campo com ajuda. No celular, toque no campo ou no ícone de interrogação. O texto explica o controle sem interromper a ação.

Os tooltips aparecem junto ao elemento, reposicionam-se quando necessário e não contêm links nem botões. Para habilitar a ajuda em outro elemento da interface, adicione um atributo `data-tooltip="Texto informativo"`; o componente `js/ui/tooltip.js` cuida do posicionamento, dos atrasos e da associação acessível. Para exibir o ícone padrão, use um elemento com `data-tooltip-icon="Texto informativo"`.

---

## 4. Página 1: mapa com sua localização

Esta tela serve para ver o mapa e a sua posição.

**Como funciona:**

1. O mapa abre mostrando o Brasil inteiro.
2. O navegador pergunta se o site pode usar sua localização.
   - **Se você permitir:** o mapa se aproxima do ponto onde você está. Aparecem um **marcador** ("Você está aqui") e um **círculo azul** com a margem de erro do GPS. Nos primeiros segundos a posição pode se ajustar algumas vezes, conforme o navegador consegue um sinal mais preciso.
   - **Se você negar:** o mapa continua mostrando o Brasil, sem marcador.
3. Se você arrastar o mapa, ele para de se recentralizar sozinho.

**Comandos do mapa:**

| Ação | Como fazer |
|---|---|
| Aproximar / afastar | Botões **+** e **−** no canto, ou a rodinha do mouse |
| Mover o mapa | Clicar e arrastar |
| Ver a margem de erro | Clicar no marcador "Você está aqui" |

> Os itens "Item 1", "Item 2" e "Item 3" do menu lateral dessa página ainda não têm função. São espaços reservados para recursos futuros.

---

## 5. Tela "Bloqueio Viário"

É a tela principal de simulação. Clique em **Bloqueio Viário** no menu superior para abri-la.

Ao abrir, aparece por alguns instantes a mensagem *"Carregando malha viária de Cajamar…"*. Em seguida o mapa mostra as ruas da região, e os veículos começam a se mover sozinhos.

### 5.1 Partes da tela

```
┌──────────────────┬─────────────────────────────────────────────┐
│ SELEÇÃO DE VIA   │                    [Pausar] Veículos [60] Velocidade [4×] │
│  Logradouro  ▼   │                                             │
│  Trecho      ▼   │                                             │
│  (dados do       │            MAPA COM AS VIAS                 │
│   trecho)        │            E OS VEÍCULOS                    │
│ AÇÕES            │                                             │
│ [Bloquear] [Desbloquear]                                       │
│ VIAS BLOQUEADAS  │                                             │
│  (lista)         │  ┌Legenda────────┐                          │
│ IMPACTO NA       │  │ cores e símbolos│                        │
│ SIMULAÇÃO        │  └───────────────┘                          │
│  (números)       │                                             │
└──────────────────┴─────────────────────────────────────────────┘
```

| Parte | Para que serve |
|---|---|
| **Seleção de via** | Escolher a rua e o trecho que você quer bloquear |
| **Ações** | Botões para bloquear ou desbloquear o trecho escolhido, e mensagens de resultado |
| **Vias bloqueadas** | Lista de tudo o que você bloqueou nesta sessão |
| **Impacto na simulação** | Números que mostram como o trânsito está reagindo |
| **Barra de controles** (canto superior direito do mapa) | Pausar, mudar a quantidade de veículos e a velocidade da simulação |
| **Legenda** (canto inferior esquerdo do mapa) | O significado de cada cor |

### 5.2 Como ler o mapa

| No mapa | Significado |
|---|---|
| Linha **cinza** | Via livre |
| Linha **azul** grossa | Via selecionada (a que você escolheu) |
| Linha **vermelha tracejada e piscando**, com um círculo vermelho e uma faixa branca no meio | Via **bloqueada** |
| Ponto **verde** | Veículo circulando normalmente |
| Ponto **laranja** | Veículo **desviado**: precisou mudar de caminho por causa de um bloqueio |
| Ponto **vermelho escuro** | Veículo **retido**: ficou parado sem nenhum caminho possível |

Passe o mouse sobre uma via para ver o nome dela.

### 5.3 O que é um "trecho"

Uma rua é dividida em **trechos**. Cada trecho é o pedaço da rua **entre dois cruzamentos**. O bloqueio é sempre feito por trecho, e não na rua inteira, como acontece numa interdição real: fecha-se um quarteirão, não a avenida toda.

Cada trecho é identificado pelas ruas que o cruzam. Por exemplo:
*"Rua Pedro Domingues — entre Rua Lázaro Dalcin e Rua Antônio da Silva Esparrinha"*.

---

## 6. Passo a passo: simular um bloqueio

### Passo 1: Escolher o trecho

Há duas formas. Escolha a mais prática para você.

**Forma A: clicando no mapa**
1. Aproxime o mapa da região desejada.
2. Clique sobre a via. Ela fica **azul**.

**Forma B: pelas listas do painel**
1. Em **Logradouro**, escolha o nome da rua. O número entre parênteses é a quantidade de trechos dela.
   - O mapa se aproxima e destaca em azul todos os trechos dessa rua.
2. Em **Trecho**, escolha qual pedaço da rua você quer.
   - O mapa se aproxima daquele trecho.

Depois de escolher, aparece no painel um quadro com os dados do trecho:

| Informação | O que mostra |
|---|---|
| Nome e referência | A rua e os cruzamentos que limitam o trecho |
| Status | **Livre** ou **Bloqueado** |
| Extensão | Comprimento do trecho, em metros |
| Sentido | **Mão única** ou **Mão dupla** |
| Veículos agora | Quantos veículos estão naquele trecho neste momento |

> Para desfazer a seleção, clique numa área vazia do mapa ou aperte **Esc**.

### Passo 2: Aplicar o bloqueio

Clique em **Bloquear** (botão vermelho). O sistema verifica o bloqueio antes de aplicar e pode responder de duas formas:

**✅ Bloqueio aceito.** Aparece uma mensagem verde, por exemplo:
*"Bloqueio aplicado. 10 veículos tiveram a rota recalculada."*

Nesse momento:
- a via fica vermelha no mapa, com o símbolo de interdição;
- todos os veículos que passariam por ali **calculam um novo caminho na hora** e ficam laranja;
- o trecho entra na lista **Vias bloqueadas**.

**❌ Bloqueio recusado.** Aparece uma mensagem vermelha explicando o motivo, por exemplo:
*"Bloqueio recusado: 5 veículos ficariam sem rota de escape (a região em que estão ficaria isolada da malha)."*

Isso **não é um erro**: é uma regra de segurança da simulação, explicada na seção 7.

### Passo 3: Acompanhar o impacto

Observe o mapa e a seção **Impacto na simulação**:

| Indicador | O que significa |
|---|---|
| **Veículos ativos** | Total de veículos na simulação |
| **Desviados** | Veículos que mudaram de caminho por causa de bloqueios |
| **Retidos** | Veículos parados sem nenhum caminho possível (o ideal é zero) |
| **Rotas recalculadas** | Quantas vezes, no total, um veículo precisou calcular um novo caminho |
| **Viagens concluídas** | Quantos veículos já chegaram ao destino |
| **Tempo médio de viagem** | Média das últimas 50 viagens, em segundos simulados. **Se subir depois de um bloqueio, o trânsito ficou mais lento.** |

**Dica para comparar:** anote o *tempo médio de viagem* antes do bloqueio, aplique o bloqueio, espere alguns segundos e compare.

### Passo 4: Remover o bloqueio

Existem três formas:
- selecionar o trecho bloqueado (no mapa ou pela lista) e clicar em **Desbloquear**;
- na lista **Vias bloqueadas**, clicar em **Remover bloqueio** no item desejado;
- com dois ou mais bloqueios, clicar em **Remover todos**.

Ao remover, a via volta a ficar cinza. Os veículos procuram de novo o caminho mais rápido, e os que estavam retidos voltam a andar.

---

## 7. Por que um bloqueio pode ser recusado

O FastFlow **não deixa veículos presos**. Antes de bloquear, ele testa o bloqueio sem aplicá-lo e confere se cada veículo continuaria tendo um caminho para voltar à malha viária principal.

O bloqueio é recusado quando:

1. **Há veículos dentro do próprio trecho que ficariam sem saída.**
   *Exemplo:* uma rua sem saída com um carro indo para o fim dela. Se o único acesso fosse bloqueado, o carro ficaria preso.

2. **O bloqueio isolaria uma região onde há veículos.**
   *Exemplo:* um trecho de mão única que é a única saída de um bairro. Bloqueá-lo deixaria quem está no bairro sem como sair.

3. **O trecho já está bloqueado.**

**O que fazer quando o bloqueio é recusado:**
- escolher outro trecho próximo;
- esperar alguns segundos e tentar de novo, porque os veículos podem ter saído da área;
- diminuir a quantidade de veículos na barra de controles.

---

## 8. Controles da simulação

Ficam no canto superior direito do mapa.

| Controle | O que faz |
|---|---|
| **Pausar / Continuar** | Congela os veículos. Você pode selecionar e bloquear vias com a simulação pausada. |
| **Veículos** (30, 60, 100, 150) | Quantos veículos circulam. Mais veículos deixam o efeito dos bloqueios mais visível, mas aumentam a chance de recusa. |
| **Velocidade** (1×, 4×, 8×) | Rapidez do tempo da simulação. Em 1× os veículos andam na velocidade real da via. |

---

## 9. Como os veículos se comportam

Para interpretar o que você vê:

- Cada veículo sai de um ponto, escolhe um **destino** e segue o **caminho mais rápido** até ele, considerando o comprimento e o limite de velocidade de cada rua.
- Ao chegar, escolhe um novo destino e continua. Por isso a simulação nunca para sozinha.
- O **sentido das vias é respeitado**: veículos não andam na contramão das ruas de mão única.
- Quando uma via é bloqueada, **ninguém entra nela**. Um veículo que já estava dentro termina de atravessá-la e segue um novo caminho.
- Se o destino de um veículo ficar inalcançável, ele escolhe outro destino em vez de ficar parado.

---

## 10. Exemplo completo

1. Abra **Bloqueio Viário** e espere as ruas aparecerem.
2. Observe o *tempo médio de viagem* (por exemplo, 35 s).
3. Em **Logradouro**, escolha *Rua Pedro Domingues*. Em **Trecho**, escolha o *Trecho 1*.
4. Clique em **Bloquear**. A mensagem informa quantos veículos foram desviados.
5. Veja os pontos laranja contornando a via vermelha.
6. Espere uns 20 segundos e compare o tempo médio de viagem.
7. Agora tente bloquear o *Trecho 1* da *Avenida Doutor Antônio João Abdalla*. O sistema recusa e explica o motivo (seção 7).
8. Na lista **Vias bloqueadas**, clique em **Remover bloqueio** para devolver a rua ao normal.

---

## 11. Perguntas frequentes

**O mapa de fundo não aparece, só as linhas das ruas.**
O mapa de fundo depende de internet. Na versão de demonstração (protótipo publicado) ele não aparece mesmo, mas as ruas, os veículos e todas as funções continuam funcionando.

**Fechei a página. Os bloqueios continuam lá?**
Não. Cada vez que a tela é aberta, a simulação começa do zero, sem bloqueios.

**Posso bloquear uma rua inteira de uma vez?**
Não. O bloqueio é feito trecho a trecho. Para interditar uma rua inteira, bloqueie os trechos um por um.

**Por que alguns trechos aparecem como "Via sem nome"?**
São vias que não têm nome cadastrado no OpenStreetMap. Elas podem ser selecionadas e bloqueadas pelo mapa, mas não aparecem na lista de logradouros.

**Posso simular outra cidade?**
Hoje a tela usa apenas o centro de Cajamar. Trocar a região exige gerar um novo arquivo de vias; o procedimento está na seção 12.

**A tela fica "Carregando malha viária…" e não sai disso.**
Atualize a página. Se estiver rodando o aplicativo no seu computador, confira se ele foi aberto por um servidor local (seção 12), e não com duplo clique no arquivo.

---

## 12. Para a equipe técnica (instalação e manutenção)

Esta seção é só para quem vai rodar ou manter o aplicativo.

**Rodar no computador:** a tela de bloqueio precisa de um servidor local. Com duplo clique no arquivo, o navegador bloqueia o carregamento das vias. Na pasta do projeto, rode:

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000/pagina2.html`.

**Publicação:** o projeto está configurado para a Vercel. A tela fica disponível em `/pagina2`.

**Testes automáticos do motor de simulação** (precisa do Node.js 22 ou mais recente):

```bash
node --test
```

**Vídeo explicativo dos tooltips:** [assistir à demonstração acessível em MP4](./videos/tooltip-acessivel.mp4). O vídeo tem legendas incorporadas e apresenta os gatilhos, o reposicionamento, os atributos de acessibilidade e os testes executados.

**Trocar a região simulada:**
1. Baixe as vias da nova área pela Overpass API. A consulta modelo está no início de `scripts/gerar-malha.mjs`; troque as coordenadas.
2. Converta para o formato do aplicativo:
   ```bash
   node scripts/gerar-malha.mjs resposta-overpass.json > data/malha.geojson
   ```
3. Atualize as constantes `CENTRO_CAJAMAR` e `AREA_SIMULADA` em `js/ui/telaBloqueio.js`.

**Organização do código:**

| Pasta | Conteúdo |
|---|---|
| `js/motor/` | Lógica da simulação: grafo viário, cálculo de rotas, veículos e regra de bloqueio. Não depende da tela. |
| `js/adaptador/` | Ponte entre a tela e o motor; também carrega o arquivo de vias |
| `js/ui/` | Tudo o que é visual: mapa, listas, painel |
| `data/malha.geojson` | Vias da região simulada |
| `css/style.css` | Estilos e tokens de cor do projeto (por exemplo `--cor-bloqueio`) |

---

## 13. Glossário

| Termo | Significado |
|---|---|
| **Malha viária** | O conjunto de todas as ruas da região simulada |
| **Logradouro** | Nome de uma rua, avenida, estrada ou praça |
| **Trecho** | Pedaço de uma via entre dois cruzamentos; é a unidade de bloqueio |
| **Bloqueio / interdição** | Fechar um trecho para que nenhum veículo entre nele |
| **Rota** | O caminho que um veículo vai seguir até o destino |
| **Recalcular rota** | Procurar um novo caminho quando o antigo deixou de ser possível |
| **Veículo desviado** | Veículo que mudou de caminho por causa de um bloqueio |
| **Veículo retido** | Veículo sem nenhum caminho possível, parado |
| **Rota de escape** | Um caminho que permite ao veículo voltar à malha principal |
| **Malha principal** | A maior parte da rede de ruas em que se consegue ir de qualquer ponto a qualquer outro |
