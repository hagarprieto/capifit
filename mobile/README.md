# CapiFit — App (mobile)

React Native + Expo (SDK 58) com Expo Router. Código em `src/`; rotas em `src/app/`.

## Comandos

```bash
npm install            # dependências (se faltar algum pacote, use `npx expo install <pacote>`)
npm start              # servidor de desenvolvimento (abra com o Expo Go ou um build de desenvolvimento)
npm run check          # tokens + TypeScript + lint + regras do projeto + testes (o mesmo que o CI roda)
npm run tokens         # regenera src/design-system/tokens.generated.ts a partir de docs/08_design_tokens.json
npm run api:types      # regenera src/api/schema.generated.ts a partir de docs/07_openapi.yaml (o check confere se está em dia)
npm run mock:api       # servidor mock do contrato em http://localhost:4010 (Prism), para trabalhar sem a API
```

## Regras do projeto

- **Cores só pelos tokens.** `docs/08_design_tokens.json` é a fonte; o tema é gerado (`npm run tokens`) e o lint reprova
  cor literal (hex, `rgb()`) em `src/` (DS-02).
- **Texto só pelo catálogo.** Toda string visível vem de `src/i18n/pt-BR.ts` via `t()`; o lint reprova texto fixo no JSX.
- Use `npx expo install` (não `npm install`) para pacotes do Expo, para obter a versão compatível com o SDK.
- Não edite `ios/` nem `android/` (gerados). Configuração nativa fica em `app.json`.

## API e autenticação

- **URL da API:** `EXPO_PUBLIC_API_URL` (ver `.env.example`; variáveis `EXPO_PUBLIC_*` ficam visíveis no app, nunca coloque segredo). Emulador Android acessa o PC por `http://10.0.2.2:PORTA`.
- **Tipos do contrato:** `src/api/schema.generated.ts` é gerado do OpenAPI (não edite). Mudou o contrato? Rode `npm run api:types` e commite; o CI reprova se estiver defasado.
- **Cliente:** `src/api/client.ts` desembrulha o envelope, devolve `ApiError` (código, campos, `request_id`, `Retry-After`), tem tempo limite e, em 401, renova o token UMA vez e repete a chamada com a mesma chave de idempotência.
- **Sessão:** tokens ficam só no armazenamento seguro do aparelho (`expo-secure-store`: Keychain/Keystore), nunca em log nem em estado de tela. `src/auth/authCore.ts` renova com uma chamada por vez; o app restaura a sessão ao abrir, inclusive sem rede (o treino não depende da conexão). O identificador do aparelho é criado uma vez e sobrevive ao logout.
- **Rotas por sessão:** `src/app/_layout.tsx` usa `Stack.Protected`: sem sessão só as telas de entrada (`boas-vindas`, `entrar`, `cadastrar`, `recuperar`); com sessão a área logada. O link do e-mail abre `redefinir-senha?token=…` (esquema `capifit://`). O guard só esconde telas: a autorização é do servidor.

## Pendências desta base (história E00-08)

- Abrir o app em um Android de entrada e em um iPhone e registrar o **tempo de abertura** (linha de base do Doc 10 §7.6).
- Ícones e splash são os **provisórios do template**; substituir pelos da marca (depende da Capi/identidade).
- Definir `android.package` e `ios.bundleIdentifier` e a versão mínima de iOS/Android antes do primeiro build (Doc 10 §10.3).
- `npm audit` aponta vulnerabilidades em dependências transitivas das ferramentas de build; reavaliar a cada atualização do SDK.
