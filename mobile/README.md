# CapiFit — App (mobile)

React Native + Expo (SDK 58) com Expo Router. Código em `src/`; rotas em `src/app/`.

## Comandos

```bash
npm install            # dependências (se faltar algum pacote, use `npx expo install <pacote>`)
npm start              # servidor de desenvolvimento (abra com o Expo Go ou um build de desenvolvimento)
npm run check          # tokens + TypeScript + lint + regras do projeto + testes (o mesmo que o CI roda)
npm run tokens         # regenera src/design-system/tokens.generated.ts a partir de docs/08_design_tokens.json
```

## Regras do projeto

- **Cores só pelos tokens.** `docs/08_design_tokens.json` é a fonte; o tema é gerado (`npm run tokens`) e o lint reprova
  cor literal (hex, `rgb()`) em `src/` (DS-02).
- **Texto só pelo catálogo.** Toda string visível vem de `src/i18n/pt-BR.ts` via `t()`; o lint reprova texto fixo no JSX.
- Use `npx expo install` (não `npm install`) para pacotes do Expo, para obter a versão compatível com o SDK.
- Não edite `ios/` nem `android/` (gerados). Configuração nativa fica em `app.json`.

## Pendências desta base (história E00-08)

- Abrir o app em um Android de entrada e em um iPhone e registrar o **tempo de abertura** (linha de base do Doc 10 §7.6).
- Ícones e splash são os **provisórios do template**; substituir pelos da marca (depende da Capi/identidade).
- Definir `android.package` e `ios.bundleIdentifier` e a versão mínima de iOS/Android antes do primeiro build (Doc 10 §10.3).
- `npm audit` aponta vulnerabilidades em dependências transitivas das ferramentas de build; reavaliar a cada atualização do SDK.
