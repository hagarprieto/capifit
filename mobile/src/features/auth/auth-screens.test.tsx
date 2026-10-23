import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design-system/ThemeProvider';
import { HomeScreen } from '@/features/home/HomeScreen';

import { describeAuthError } from './errors';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { LoginScreen } from './LoginScreen';
import { RegisterScreen } from './RegisterScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { validateLogin, validateRegister } from './validation';
import { WelcomeScreen } from './WelcomeScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
}));

const mockAuth = {
  user: { id: 'u1', nome: 'Ana' } as { id: string; nome: string } | null,
  offline: false,
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
};
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));

function show(node: React.ReactElement) {
  return render(<ThemeProvider initialPreference="dark">{node}</ThemeProvider>);
}

const apiError = (status: number, code: string, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) => new ApiError({ status, code, message: '', ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockAuth.offline = false;
  mockAuth.user = { id: 'u1', nome: 'Ana' };
});

describe('validação', () => {
  it('login exige e-mail válido e senha preenchida', () => {
    expect(validateLogin('', '')).toEqual({ email: 'Informe um e-mail válido.', senha: 'Informe a senha.' });
    expect(validateLogin('ana@exemplo.com', 'x')).toEqual({});
  });

  it('cadastro valida nome, e-mail, senha de 10+ caracteres e os dois aceites', () => {
    expect(Object.keys(validateRegister({ nome: ' ', email: 'x', senha: 'curta', aceite: false, maior18: false })).sort()).toEqual(['aceite', 'email', 'maior18', 'nome', 'senha']);
    expect(validateRegister({ nome: 'Ana', email: 'ana@exemplo.com', senha: '1234567890', aceite: true, maior18: true })).toEqual({});
    expect(validateRegister({ nome: 'Ana', email: 'ana@exemplo.com', senha: 'a'.repeat(201), aceite: true, maior18: true }).senha).toBeDefined();
  });
});

describe('describeAuthError', () => {
  it('traduz rede, limite, credencial, e-mail repetido, validação e erro desconhecido', () => {
    expect(describeAuthError(apiError(0, 'NETWORK_ERROR'), ['email'] as const).form).toBe('Sem conexão. Verifique a internet e tente de novo.');
    expect(describeAuthError(apiError(429, 'RATE_LIMITED', { retryAfter: 600 }), ['email'] as const).form).toBe('Muitas tentativas. Tente de novo em 10 min.');
    expect(describeAuthError(apiError(401, 'UNAUTHENTICATED'), ['email'] as const).form).toBe('E-mail ou senha incorretos.');
    expect(describeAuthError(apiError(409, 'EMAIL_ALREADY_REGISTERED'), ['email'] as const).fields?.email).toBe('Este e-mail já está cadastrado. Tente entrar.');
    expect(describeAuthError(apiError(422, 'VALIDATION_ERROR', { fields: { senha: ['Muito curta.'] } }), ['email', 'senha'] as const).fields).toEqual({ senha: 'Muito curta.' });
    expect(describeAuthError(apiError(422, 'VALIDATION_ERROR', { fields: { outro: ['x'] } }), ['email'] as const).form).toBe('Não foi possível concluir agora. Tente de novo.');
    expect(describeAuthError(new Error('qualquer'), ['email'] as const).form).toBe('Não foi possível concluir agora. Tente de novo.');
  });
});

describe('WelcomeScreen', () => {
  it('leva para o cadastro e para a entrada', async () => {
    await show(<WelcomeScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(mockRouter.push).toHaveBeenNthCalledWith(1, '/cadastrar');
    expect(mockRouter.push).toHaveBeenNthCalledWith(2, '/entrar');
    expect(screen.getByText('Seu treino com mais leveza.')).toBeTruthy();
  });
});

describe('LoginScreen', () => {
  async function fill(email: string, senha: string) {
    await fireEvent.changeText(screen.getByLabelText('E-mail'), email);
    await fireEvent.changeText(screen.getByLabelText('Senha'), senha);
  }

  it('não envia com campos inválidos e mostra os erros por campo', async () => {
    await show(<LoginScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(mockAuth.signIn).not.toHaveBeenCalled();
    expect(screen.getByText('Erro: Informe um e-mail válido.')).toBeTruthy();
    expect(screen.getByText('Erro: Informe a senha.')).toBeTruthy();
  });

  it('envia e-mail e senha digitados', async () => {
    mockAuth.signIn.mockResolvedValue(undefined);
    await show(<LoginScreen />);
    await fill('ana@exemplo.com', 'senha-longa-123');

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(mockAuth.signIn).toHaveBeenCalledWith('ana@exemplo.com', 'senha-longa-123'));
  });

  it('credencial errada mostra uma única mensagem geral', async () => {
    mockAuth.signIn.mockRejectedValue(apiError(401, 'UNAUTHENTICATED'));
    await show(<LoginScreen />);
    await fill('ana@exemplo.com', 'errada-errada');

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeTruthy();
  });

  it('sem rede mostra o aviso de conexão e permite tentar de novo', async () => {
    mockAuth.signIn.mockRejectedValueOnce(apiError(0, 'NETWORK_ERROR')).mockResolvedValueOnce(undefined);
    await show(<LoginScreen />);
    await fill('ana@exemplo.com', 'senha-longa-123');

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Sem conexão. Verifique a internet e tente de novo.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(mockAuth.signIn).toHaveBeenCalledTimes(2));
  });

  it('enquanto envia, o botão fica ocupado e o segundo toque é ignorado', async () => {
    let finish: () => void = () => {};
    mockAuth.signIn.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await show(<LoginScreen />);
    await fill('ana@exemplo.com', 'senha-longa-123');

    // Sem await: o toque só termina quando o envio termina, e o teste precisa tocar de novo enquanto ele está pendente.
    void fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' }).props.accessibilityState).toMatchObject({ busy: true }));
    void fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(mockAuth.signIn).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it('abre a recuperação e o cadastro', async () => {
    await show(<LoginScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ainda não tenho conta' }));

    expect(mockRouter.push).toHaveBeenCalledWith('/recuperar');
    expect(mockRouter.replace).toHaveBeenCalledWith('/cadastrar');
  });
});

describe('RegisterScreen', () => {
  async function fillAll() {
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Ana');
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@exemplo.com');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-longa-123');
    await fireEvent.press(screen.getByRole('checkbox', { name: /Li e aceito/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /18 anos/ }));
  }

  it('exige os dois aceites e mostra o motivo', async () => {
    await show(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Ana');
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@exemplo.com');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-longa-123');

    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

    expect(mockAuth.signUp).not.toHaveBeenCalled();
    expect(screen.getByText('Erro: É preciso aceitar para continuar.')).toBeTruthy();
    expect(screen.getByText('Erro: O CapiFit é para maiores de 18 anos.')).toBeTruthy();
  });

  it('envia o cadastro completo', async () => {
    mockAuth.signUp.mockResolvedValue(undefined);
    await show(<RegisterScreen />);
    await fillAll();

    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => expect(mockAuth.signUp).toHaveBeenCalledWith({ nome: 'Ana', email: 'ana@exemplo.com', senha: 'senha-longa-123' }));
  });

  it('e-mail já cadastrado vira erro no campo, não aviso geral', async () => {
    mockAuth.signUp.mockRejectedValue(apiError(409, 'EMAIL_ALREADY_REGISTERED'));
    await show(<RegisterScreen />);
    await fillAll();

    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Erro: Este e-mail já está cadastrado. Tente entrar.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('erro de validação do servidor aparece no campo indicado', async () => {
    mockAuth.signUp.mockRejectedValue(apiError(422, 'VALIDATION_ERROR', { fields: { senha: ['Senha fraca.'] } }));
    await show(<RegisterScreen />);
    await fillAll();

    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Erro: Senha fraca.')).toBeTruthy();
  });
});

describe('ForgotPasswordScreen', () => {
  it('valida o e-mail antes de enviar', async () => {
    await show(<ForgotPasswordScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar link' }));

    expect(mockAuth.requestPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByText('Erro: Informe um e-mail válido.')).toBeTruthy();
  });

  it('sempre mostra a mesma mensagem, sem revelar se existe conta', async () => {
    mockAuth.requestPasswordReset.mockResolvedValue(undefined);
    await show(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'qualquer@exemplo.com');

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByText(/Se existir uma conta com este e-mail/)).toBeTruthy();
    expect(mockAuth.requestPasswordReset).toHaveBeenCalledWith('qualquer@exemplo.com');
  });

  it('sem rede, avisa e mantém o formulário', async () => {
    mockAuth.requestPasswordReset.mockRejectedValue(apiError(0, 'NETWORK_ERROR'));
    await show(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@exemplo.com');

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByText('Sem conexão. Verifique a internet e tente de novo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar link' })).toBeTruthy();
  });
});

describe('ResetPasswordScreen', () => {
  it('sem token no link, orienta a pedir outro', async () => {
    await show(<ResetPasswordScreen />);

    expect(screen.getByText('Link inválido ou expirado. Peça um novo link.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Pedir novo link' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/recuperar');
  });

  it('com token, valida a senha nova e conclui', async () => {
    mockParams = { token: 'tok-123' };
    mockAuth.resetPassword.mockResolvedValue(undefined);
    await show(<ResetPasswordScreen />);

    await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'curta');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(mockAuth.resetPassword).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'senha-nova-longa-1');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar nova senha' }));

    await waitFor(() => expect(mockAuth.resetPassword).toHaveBeenCalledWith('tok-123', 'senha-nova-longa-1'));
    expect(await screen.findByText('Senha alterada. Entre com a nova senha.')).toBeTruthy();
  });

  it('token inválido, vencido ou usado mostra a mesma mensagem de link inválido', async () => {
    mockParams = { token: 'tok-vencido' };
    mockAuth.resetPassword.mockRejectedValue(apiError(422, 'VALIDATION_ERROR', { fields: { token: ['Link inválido ou expirado.'] } }));
    await show(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'senha-nova-longa-1');

    await fireEvent.press(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(await screen.findByText('Link inválido ou expirado. Peça um novo link.')).toBeTruthy();
  });
});

describe('HomeScreen', () => {
  it('cumprimenta pelo nome e avisa o modo offline', async () => {
    mockAuth.offline = true;
    await show(<HomeScreen />);

    expect(screen.getByText('Olá, Ana! Bora treinar?')).toBeTruthy();
    expect(screen.getByText('Sem conexão: você pode treinar normalmente.')).toBeTruthy();
  });
});
