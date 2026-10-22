/** Catálogo de textos (pt-BR). Toda string visível ao usuário nasce aqui (Doc 03 §13.3). */
export const ptBR = {
  'app.nome': 'CapiFit',

  'tema.sistema': 'Sistema',
  'tema.claro': 'Claro',
  'tema.escuro': 'Escuro',

  'themeCheck.titulo': 'Verificação do tema',
  'themeCheck.subtitulo': 'Marco M0 · confira cores, tipografia e fonte ampliada',
  'themeCheck.secaoTema': 'Tema',
  'themeCheck.temaAtual': 'Tema em uso: {tema}',
  'themeCheck.secaoCores': 'Cores',
  'themeCheck.secaoTipografia': 'Tipografia',
  'themeCheck.amostra': 'Série 2 · 40 kg × 10',
  'themeCheck.secaoFonte': 'Fonte ampliada',
  'themeCheck.dicaFonte': 'Aumente a fonte do sistema até 200% e confirme que nenhum texto é cortado e que os botões continuam acessíveis.',
  'themeCheck.versaoTokens': 'Tokens v{versao}',

  'a11y.selecionarTema': 'Usar tema {tema}',

  'campo.erro': 'Erro: {mensagem}',
  'campo.mostrar': 'Mostrar',
  'campo.ocultar': 'Ocultar',
  'campo.mostrarSenha': 'Mostrar senha',
  'campo.ocultarSenha': 'Ocultar senha',
  'campo.marcado': 'OK',

  'aviso.erro': 'Algo deu errado',
  'aviso.atencao': 'Atenção',
  'aviso.info': 'Informação',
  'aviso.sucesso': 'Tudo certo',

  'auth.boasVindas.titulo': 'Seu treino com mais leveza.',
  'auth.boasVindas.texto': 'Monte seus treinos, registre cada série e acompanhe sua evolução, com a Capi ao seu lado.',
  'auth.boasVindas.entrar': 'Entrar',
  'auth.boasVindas.criar': 'Criar conta',

  'auth.entrar.titulo': 'Entrar',
  'auth.entrar.email': 'E-mail',
  'auth.entrar.senha': 'Senha',
  'auth.entrar.botao': 'Entrar',
  'auth.entrar.esqueci': 'Esqueci minha senha',
  'auth.entrar.semConta': 'Ainda não tenho conta',

  'auth.cadastro.titulo': 'Criar conta',
  'auth.cadastro.nome': 'Nome',
  'auth.cadastro.email': 'E-mail',
  'auth.cadastro.senha': 'Senha',
  'auth.cadastro.senhaDica': 'Mínimo de 10 caracteres.',
  'auth.cadastro.aceite': 'Li e aceito os Termos de Uso e a Política de Privacidade',
  'auth.cadastro.maior18': 'Declaro ter 18 anos ou mais',
  'auth.cadastro.botao': 'Criar conta',
  'auth.cadastro.jaTenho': 'Já tenho conta',

  'auth.recuperar.titulo': 'Recuperar senha',
  'auth.recuperar.texto': 'Informe o e-mail da conta. Enviaremos um link para criar uma nova senha.',
  'auth.recuperar.email': 'E-mail',
  'auth.recuperar.botao': 'Enviar link',
  'auth.recuperar.enviado': 'Se existir uma conta com este e-mail, enviamos um link para redefinir a senha. Confira também a caixa de spam.',
  'auth.recuperar.voltar': 'Voltar para entrar',

  'auth.redefinir.titulo': 'Nova senha',
  'auth.redefinir.senha': 'Nova senha',
  'auth.redefinir.botao': 'Salvar nova senha',
  'auth.redefinir.ok': 'Senha alterada. Entre com a nova senha.',
  'auth.redefinir.linkInvalido': 'Link inválido ou expirado. Peça um novo link.',
  'auth.redefinir.pedirNovo': 'Pedir novo link',

  'auth.erro.credenciais': 'E-mail ou senha incorretos.',
  'auth.erro.rede': 'Sem conexão. Verifique a internet e tente de novo.',
  'auth.erro.limite': 'Muitas tentativas. Tente de novo em {minutos} min.',
  'auth.erro.emailCadastrado': 'Este e-mail já está cadastrado. Tente entrar.',
  'auth.erro.generico': 'Não foi possível concluir agora. Tente de novo.',

  'auth.valida.email': 'Informe um e-mail válido.',
  'auth.valida.senhaObrigatoria': 'Informe a senha.',
  'auth.valida.senhaMinima': 'Use ao menos 10 caracteres.',
  'auth.valida.nome': 'Informe seu nome.',
  'auth.valida.aceite': 'É preciso aceitar para continuar.',
  'auth.valida.maior18': 'O CapiFit é para maiores de 18 anos.',

  'home.ola': 'Olá, {nome}',
  'home.texto': 'Sua área de treino chega nos próximos marcos.',
  'home.offline': 'Sem conexão: você pode treinar normalmente.',
  'home.sair': 'Sair',
  'home.verTema': 'Verificação do tema',
} as const;

export type MessageKey = keyof typeof ptBR;
