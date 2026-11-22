import { AccountDialog } from "./AccountDialog.jsx";

export function PrivacyPanel({ onClose }) {
  return (
    <AccountDialog title="Privacidade" className="privacy-panel" onClose={onClose}>
      <div className="account-body">
        <p>Usamos os dados da sua conta para manter seu perfil e registrar suas pontuações no ranking.</p>
        <div>
          <h3>O que guardamos</h3>
          <p>Guardamos seu nome de usuário, nome de exibição, bio, cor do polvo e pontuações com data e plataforma (PC ou celular).</p>
          <p>No login com Google, seu nome e e-mail ficam no provedor de login Neon Auth. Seu e-mail nunca aparece publicamente.
            Contas com usuário e senha não têm e-mail real associado.</p>
        </div>
        <div>
          <h3>O que é público</h3>
          <p>Seu perfil é público por padrão. Você pode torná-lo privado em Editar perfil. Nesse modo, visitantes do perfil veem
            apenas seu nome e avatar. As pontuações do ranking continuam públicas.</p>
        </div>
        <div>
          <h3>Como apagar sua conta</h3>
          <p>Abra seu perfil e escolha Excluir minha conta. A exclusão apaga seu login, seu perfil e suas pontuações.</p>
        </div>
        <div>
          <h3>Jogar sem conta</h3>
          <p>Ao jogar sem conta, o jogo não envia suas partidas nem suas pontuações. Suas preferências ficam só no navegador.</p>
        </div>
      </div>
    </AccountDialog>
  );
}
