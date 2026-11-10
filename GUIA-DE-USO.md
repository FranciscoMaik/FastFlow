# Guia de uso do FastFlow

Este guia explica, passo a passo, como usar o FastFlow pela primeira vez: o que cada tela mostra, o que cada botão faz, como simular o bloqueio de uma via e como gerenciar dispositivos de controle de tráfego (lombadas e semáforos). Não é preciso saber programação para acompanhar.

---

## 1. O que é o FastFlow

O FastFlow é um aplicativo web de **simulação de tráfego**. Ele mostra um mapa da cidade com veículos virtuais circulando pelas ruas. Na tela de bloqueio viário você pode **interditar uma via**, como se houvesse uma obra ou um acidente, e **inserir dispositivos de controle de tráfego** (lombadas e semáforos interativos), acompanhando na hora o que acontece com o trânsito:

- desaceleração e retomada de velocidade nas lombadas;
- formação e dispersão de filas seguras em semáforos vermelhos;
- quais veículos precisam mudar de caminho;
- se algum veículo fica sem saída;
- quanto o tempo médio das viagens aumenta.

As regiões simuláveis são **Centro**, **Jordanésia**, **Polvilho** e **Ponunduva** (Cajamar/SP), com as ruas reais tiradas do OpenStreetMap. O seletor **Local** no painel troca a área nas telas de simulação.

> **Importante:** tudo é uma simulação. Bloquear uma via ou posicionar semáforos no FastFlow não afeta o trânsito real nem nenhum outro sistema.

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

- **E-mail:** `teste@teste.com`
- **Senha:** `test123`

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

Ao abrir, aparece por alguns instantes a mensagem *"Carregando malha viária…"* com o nome do local escolhido. Em seguida o mapa mostra as ruas da área, e os veículos começam a se mover sozinhos. Use o seletor **Local** no painel para alternar entre Centro, Jordanésia, Polvilho e Ponunduva.

A lista de seleção apresenta apenas trechos estruturais ativos, com alternativa de circulação na malha. Ruas locais, trechos terminais/sem desvio e vias desativadas não podem receber bloqueios. Ao clicar em uma dessas vias no mapa, o painel e a dica do mapa explicam o motivo; o botão **Bloquear** permanece desabilitado. Trechos já bloqueados continuam disponíveis para seleção e desbloqueio.

Como critério de homologação, são aceitos `motorway`, `trunk`, `primary`, `secondary`, `tertiary` e suas variantes `_link`, desde que o grafo ativo ofereça alternativa para cada sentido de tráfego. Vias sem acesso veicular ou com estado `ativo`/`operacional` falso também são retiradas da simulação.

### 5.1 Partes da tela

```
┌──────────────────┬──────────────────────────────────────────────────────────┐
│ SELEÇÃO DE VIA   │ [✋ Selecionar] [▲ + Lombada] [🚦 + Semáforo] | [Pausar] [60] [4×] │
│  Logradouro  ▼   │                                                          │
│  Trecho      ▼   │                                                          │
│ AÇÕES DE VIA     │                    MAPA COM AS VIAS,                     │
│ [Bloquear]       │                 VEÍCULOS E DISPOSITIVOS                  │
│ VIAS BLOQUEADAS  │                                                          │
│ DISPOSITIVOS     │  ┌Legenda─────────────────┐                              │
│  (lombadas/sem)  │  │ cores, símbolos, luzes │                              │
│ IMPACTO          │  └────────────────────────┘                              │
└──────────────────┴──────────────────────────────────────────────────────────┘
```

| Parte | Para que serve |
|---|---|
| **Ferramentas interativas** (barra superior do mapa) | Alternar entre o modo de seleção normal, inserção de **lombada** ou de **semáforo** |
| **Seleção de via** | Escolher a rua e o trecho que você quer inspecionar ou bloquear |
| **Ações de via** | Botões para bloquear ou desbloquear o trecho escolhido, e mensagens de resultado |
| **Vias bloqueadas** | Lista de trechos bloqueados com botão para localizar e remover |
| **Dispositivos de tráfego** | Contadores e lista de lombadas e semáforos instalados, com status dinâmico e opções de remoção |
| **Impacto na simulação** | Métricas em tempo real (veículos ativos, desviados, retidos, rotas e tempo médio de viagem) |
| **Barra de controles** | Pausar, alterar quantidade de veículos e velocidade da simulação |
| **Legenda** (canto inferior esquerdo) | Guia visual de vias, veículos e dispositivos |

### 5.2 Como ler o mapa

| No mapa | Significado |
|---|---|
| Linha **cinza** | Via livre |
| Linha **azul** grossa | Via selecionada |
| Linha **vermelha tracejada**, círculo vermelho | Via **bloqueada** |
| Ponto **verde** | Veículo circulando normalmente |
| Ponto **laranja** | Veículo **desviado** por causa de um bloqueio |
| Ponto **vermelho escuro** | Veículo **retido** (sem caminho possível) |
| Quadrado amarelo com ondulação (**▲**) | **Lombada** (redutor de velocidade para 20 km/h) |
| Caixa preta com luzes verticais (**🚦**) | **Semáforo** com fase ativa (verde, amarelo ou vermelho) |

---

## 6. Dispositivos de tráfego: Lombadas e Semáforos

A tela permite avaliar intervenções físicas e semafóricas na malha viária em tempo real.

### 6.1 Como inserir uma lombada ou semáforo

1. Na barra superior do mapa, clique em **+ Lombada** ou **+ Semáforo**.
   - O cursor do mouse mudará para mira de precisão (`crosshair`).
   - Um banner flutuante no topo confirmará a ferramenta ativa.
2. Clique sobre a via onde deseja posicionar o dispositivo.
   - O sistema realiza o **encaixe magnético (*snap*) automático** no segmento de via mais próximo.
   - Se o clique for muito distante da malha (> 35 metros), a inserção é recusada com aviso, impedindo dispositivos soltos fora das ruas.
3. O dispositivo é criado imediatamente e o mapa retorna ao modo normal de seleção.

### 6.2 Reposicionamento por arraste (*Drag and Drop*)

- Qualquer lombada ou semáforo pode ser **arrastado diretamente no mapa**.
- Ao soltar o marcador, ele se conecta automaticamente ao ponto mais próximo do traçado da via.
- Se solto fora da malha viária, ele retorna com segurança à posição anterior e emite aviso explicativo.

### 6.3 Ciclo semafórico e configuração de tempos

- Os semáforos operam uma **máquina de estados assíncrona e autônoma**:
  - `Verde` → `Amarelo` → `Vermelho` → `Verde`.
- **Configuração de tempos:** clique no semáforo no mapa para abrir o pop-up de configuração:
  - Altere a duração em segundos de cada fase (Verde, Amarelo e Vermelho) e clique em **Salvar tempos**.
  - O botão **Avançar fase** permite forçar a alternância imediata para teste de retenção e dispersão.
- Se a simulação for acelerada (4×, 8×) ou pausada, a temporização acompanha a física proporcionalmente.

### 6.4 Efeito nos veículos e comportamento de fila

- **Lombada:** veículos que se aproximam da lombada (raio de ~25 metros) desaceleram suavemente de sua velocidade padrão até ~20 km/h (5.5 m/s). Após a transposição, aceleram progressivamente até o limite da via.
- **Semáforo no Amarelo:** veículos com distância de frenagem segura desaceleram para parar; veículos muito próximos ao cruzamento transpõem com atenção.
- **Semáforo no Vermelho:** parada obrigatória antes da linha de retenção.
- **Formação de Fila Segura:** os veículos que chegam ao semáforo vermelho mantêm distância de segurança de ~7 metros entre si, enfileirando-se perfeitamente sem sobreposição gráfica de pontos.
- **Abertura do Verde:** o veículo líder arranca e os veículos subsequentes aceleram progressivamente, reproduzindo a onda de liberação do tráfego urbano.

### 6.5 Remoção de dispositivos

- **Pelo mapa:** clique no marcador do dispositivo e selecione **Remover**.
- **Pelo painel lateral:** na seção *Dispositivos de tráfego*, clique em **Remover** no item correspondente.
- **Remoção em massa:** clique em **Remover todos dispositivos** para limpar todas as intervenções semafóricas e lombadas de uma vez.

---

## 7. Simular um bloqueio viário

### Passo 1: Escolher o trecho

- **Pelo mapa:** clique na via desejada para selecioná-la (fica azul).
- **Pelo painel:** escolha o logradouro e o trecho nas caixas de seleção.

### Passo 2: Bloquear a via

1. Clique no botão **Bloquear**.
2. O sistema verifica o bloqueio antes de aplicar:
   - **Aceito:** mensagem verde (ex.: *"Bloqueio aplicado. 10 veículos tiveram a rota recalculada."*), a via fica vermelha com ícone de interdição, os veículos afetados recalculam a rota (pontos laranja) e o trecho entra em **Vias bloqueadas**.
   - **Recusado:** mensagem vermelha com o motivo. Isso **não é um erro** — é a regra de segurança da seção 7.2.
3. O tempo médio de viagem passa a refletir a perda de fluidez.

### Passo 3: Remover o bloqueio

- Selecione a via e clique em **Desbloquear**, ou clique em **Remover** na lista de vias bloqueadas.
- Com dois ou mais bloqueios, use **Remover todos**.

### 7.1 Rodovias e tráfego de passagem

Em **Jordanésia** e **Polvilho**, a **Rodovia Comunicador Silvio Santos (SP-330)** e suas alças de acesso fazem parte da simulação. Em Jordanésia, a **Rodovia Edgard Máximo Zambotto (SP-354)** também.

- Uma rodovia atravessa a região: os veículos **entram pela borda do mapa** de um lado e **saem pela borda** do outro (tráfego de passagem). Parte dos veículos dos bairros também usa as alças para entrar na rodovia e deixar a região.
- Vias de maior hierarquia (rodovias, avenidas) recebem mais tráfego que ruas residenciais.
- A quantidade escolhida em **Veículos** continua valendo: quem sai pela borda é reposto por um novo veículo. Como a malha dessas regiões ficou maior com a rodovia, aumente a quantidade (100 ou 150) para ver os bairros e a rodovia bem movimentados ao mesmo tempo.
- **Bloquear a rodovia** é permitido mesmo com veículos nela: quem já passou da última alça antes da interdição **forma fila** (pontos vermelhos, "retidos"), e quem chega depois desvia pelas alças. Ao desbloquear, a fila se desfaz. Nas vias dos bairros a regra continua a mesma: um bloqueio que deixaria algum veículo sem saída é recusado.

### 7.2 Por que um bloqueio pode ser recusado

O FastFlow **não deixa veículos presos**. Antes de bloquear, verifica a topologia ativa e confirma que cada sentido operacional do trecho tem uma rota alternativa entre seus nós adjacentes. Também confere se cada veículo continuaria tendo um caminho para voltar à malha viária principal. A análise topológica é refeita ao carregar a malha e após cada bloqueio/desbloqueio; ela não roda no laço de animação.

O bloqueio é recusado quando:

1. **O trecho é terminal ou não tem uma rota alternativa** depois da interdição.
2. **A via não é estrutural ou está inoperante.** Vias locais e vias sem funcionamento não aparecem como opções na lista.
3. **Há veículos dentro do próprio trecho que ficariam sem saída.**
   *Exemplo:* uma rua sem saída com um carro indo para o fim dela. Se o único acesso fosse bloqueado, o carro ficaria preso.
4. **O bloqueio isolaria uma região onde há veículos.**
   *Exemplo:* um trecho de mão única que é a única saída de um bairro. Bloqueá-lo deixaria quem está no bairro sem como sair.
5. **O trecho já está bloqueado.**

**O que fazer quando o bloqueio é recusado:**
- escolher outro trecho próximo;
- esperar alguns segundos e tentar de novo, porque os veículos podem ter saído da área;
- diminuir a quantidade de veículos na barra de controles.

**Vídeo:** [demonstração da validação de bloqueios](./videos/fastflow-validacao-bloqueios.mp4).

---

## 8. Controles da simulação

| Controle | O que faz |
|---|---|
| **Pausar / Continuar** | Congela veículos e temporizadores. Você pode inserir/remover dispositivos e bloquear vias com a simulação pausada. |
| **Veículos** (30, 60, 100, 150) | Quantidade de veículos circulando simultaneamente. |
| **Velocidade** (1×, 4×, 8×) | Fator de aceleração temporal da simulação física. |

---

## 9. Testes automáticos

Para rodar todos os testes automatizados do motor, lombadas, semáforos e rotas:

```bash
node --test
```

**Vídeo explicativo dos tooltips:** [assistir à demonstração acessível em MP4](./videos/tooltip-acessivel.mp4). O vídeo tem legendas incorporadas e apresenta os gatilhos, o reposicionamento, os atributos de acessibilidade e os testes executados.

**Cadastrar uma nova região simulada:**
1. Baixe as vias da nova área pela Overpass API. A consulta modelo está no início de `scripts/gerar-malha.mjs`; troque as coordenadas. Mantenha `motorway`, `motorway_link`, `trunk_link` e as demais classes da consulta: sem as alças (`*_link`), as rodovias ficam desligadas das ruas.
2. Converta para o formato do aplicativo:
   ```bash
   node scripts/gerar-malha.mjs resposta-overpass.json > data/malha-nova-regiao.geojson
   ```
3. Acrescente a região em `data/locais.json` com `id`, `nome`, `descricao`, `arquivo` e `limites` (`[[sul, oeste], [norte, leste]]`, a área que o mapa enquadra). O campo `padrao` define a região que abre primeiro.
4. Rode `node --test`: um dos testes confere se todas as malhas cadastradas seguem o formato padrão. No navegador, uma malha fora do padrão é recusada com uma mensagem, e o operador pode escolher outra região.

**Organização do código:**

| Pasta | Conteúdo |
|---|---|
| `js/motor/` | Lógica da simulação: grafo viário, cálculo de rotas, veículos e regra de bloqueio. Não depende da tela. |
| `js/adaptador/` | Ponte entre a tela e o motor; também carrega o arquivo de vias |
| `js/ui/` | Tudo o que é visual: mapa, listas, painel |
| `data/locais.json` | Cadastro das regiões que aparecem no seletor |
| `data/malha*.geojson` | Vias de cada região simulada (`malha.geojson` é o Centro) |
| `css/style.css` | Estilos e tokens de cor do projeto (por exemplo `--cor-bloqueio`) |

---

## 10. Glossário

| Termo | Significado |
|---|---|
| **Lombada** | Dispositivo físico de moderação de velocidade (redutor) |
| **Semáforo** | Dispositivo eletrônico com fases verde, amarelo e vermelho para controle de fluxo |
| **Snap à malha** | Projeção ortogonal matemática que atrela o dispositivo ao segmento de via mais próximo |
| **Comportamento de fila** | Espaçamento mínimo seguro mantido entre veículos parados em semáforos vermelhos |
| **Tempo médio de viagem** | Média das durações das viagens concluídas, indicador de fluidez viária |
