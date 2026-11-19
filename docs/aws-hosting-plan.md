# Trilho na AWS (modelo ForgeX)

## Problema

Hoje o workspace é um único JSON local (`~/Library/Application Support/com.henriquepires.trilho/trilho.json`, ~1,1 MB), e o MCP é stdio, lendo esse arquivo. Bots em outras máquinas não enxergam esse arquivo nem conseguem chamar o MCP do Mac.

## O que reaproveitar do ForgeX (`forgex-api/sam/template.yaml`)

- SAM, com Lambda Node 22 e HTTP API, **sem VPC** (é a proteção contra o incidente do NAT Gateway).
- Região `sa-east-1`,.
- Logs com retenção de 7 dias, AWS Budget e alarmes de billing soft/hard por e-mail.
- Segredo em SSM SecureString, não em Secrets Manager.
- Domínio custom com o cert ACM wildcard `*.fgex.app`, que já existe em sa-east-1.
- O stack Pulumi/ECS/NAT antigo **não** é o modelo.

## Arquitetura alvo

```
bots (Claude Code, Grok, Forgex QA…) ──HTTP MCP + Bearer──┐
app desktop / web ──REST + Bearer─────────────────────────┤
                                                           ▼
                       trilho.fgex.app → HTTP API → Lambda (Node 22, sem VPC)
                                                           │  GET/PUT com If-Match (ETag)
                                                           ▼
                                   S3: trilho-production-data/workspace.json (versionado)
```

1. **Storage: um objeto no S3** (`workspace.json`), com versionamento ligado. A concorrência usa escrita condicional (`PutObject` com `If-Match` no ETag): se der 412, relê, reaplica a mudança e tenta de novo. Não precisa de banco. DynamoDB não serve (item limitado a 400 KB, e o workspace tem 1,1 MB), e Atlas seria uma dependência a mais sem ganho.
2. **Uma Lambda só**, com duas superfícies:
   - `POST /mcp`: o mesmo `createTrilhoServer`, via `StreamableHTTPServerTransport` em modo stateless. As 11 ferramentas não mudam; só o `storage.ts` ganha um adapter S3 (hoje é `fs`).
   - `GET /workspace` e `PUT /workspace` (com `If-Match`), para o app.
3. **Auth**: token Bearer único, guardado em SSM SecureString (é uso pessoal). Um token por cliente fica para depois, se quiser revogar só um bot.
4. **Clientes MCP**:
   - `claude mcp add -s user --transport http trilho https://trilho.fgex.app/mcp -H "Authorization: Bearer …"`
   - `grok mcp add trilho https://trilho.fgex.app/mcp -H "Authorization: Bearer …"`
5. **App desktop**: um novo modo "nuvem" no `persist.ts`.
   - `loadState` → `GET /workspace`. `saveState` → `PUT` com o ETag base.
   - Polling de ~5 s (e ao focar a janela) substitui o file watcher do Tauri.
   - Em 412, faz merge por entidade usando `updatedAt` (issues têm o campo) e reenvia. Isso evita sobrescrever o que um bot escreveu entre dois polls.
   - O modo local continua como padrão para quem não configurar URL e token.
6. **Migração**: upload único do `trilho.json` atual para o S3, depois o app passa para o modo nuvem.

## Custo estimado (uso pessoal, alguns bots)

| Item | Mês |
| --- | --- |
| Lambda + HTTP API (dezenas de milhares de req) | ~US$ 0 a 0,10 |
| S3 (1 MB × versões, alguns milhares de GET/PUT) | < US$ 0,10 |
| CloudWatch Logs (7 d) | ~US$ 0 |
| SSM SecureString (standard) | US$ 0 |
| **Total** | **< US$ 1** |

Guardas: Budget de US$ 5 e alarme soft de US$ 2, ambos com e-mail.

## Fases (um PR cada)

1. **Storage adapter + MCP HTTP**: interface `WorkspaceStore` (fs | s3) com retry em 412, entrypoint Lambda, testes do adapter com S3 mockado e teste do transport HTTP.
2. **Infra SAM**: template (bucket versionado, Lambda, HTTP API, domínio `trilho.fgex.app`, log 7 d, budget, SSM), deploy, upload do workspace e smoke via `curl` + `grok mcp doctor`.
3. **App em modo nuvem**: `persist.ts` remoto, polling, merge em conflito e tela de configuração (URL + token).
4. **Trocar os clientes**: Claude Code e Grok passam para HTTP, e o bot Forgex QA recebe a URL e o token.

## Riscos

- O app grava o workspace inteiro: sem o merge em 412, uma edição no app apaga o que um bot escreveu. O merge da fase 3 é obrigatório antes de usar app e bots juntos.
- Cold start de ~1 a 2,5 s na primeira chamada; aceitável para MCP.
- O token vaza = escrita total. Mitigação: rotacionar via SSM, e o versionamento do S3 permite voltar o workspace.
