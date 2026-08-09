# [mcp-local harness] feature: fcm-backend | plano: 82950fd0 | 2026-08-09 14:20:57
# Ajusta enviar_novo_chamado para levantar TokenFcmInvalido especificamente em vez de so retornar False sempre
"""Cliente do Firebase Admin SDK -- envio de push notification (FCM)
pro app do motorista. Fase 4 da Delegação de Venda, sessão 09/08.

BEST-EFFORT DE PROPÓSITO, mesmo espírito de app/core/geocoding.py:
qualquer falha aqui (credencial não configurada, Firebase fora do ar,
token inválido/expirado, erro de rede) NUNCA deve impedir a operação
de negócio que disparou o envio (criar/reatribuir um chamado). O app
do motorista já funciona via polling (15s) independente disso -- o
push é só um acelerador de robustez (alertar com o app fechado/
minimizado), não uma dependência crítica do fluxo.

MENSAGEM DATA-ONLY DE PROPÓSITO (sem bloco `notification`): com
`data`-only, o `onMessageReceived()` do app SEMPRE roda no lado
Android, mesmo com o app em background -- é isso que permite ao
código nativo (ainda não implementado nesta sessão, ver README seção
"App do Motorista") decidir como mostrar o alerta (canal de alta
prioridade + `USE_FULL_SCREEN_INTENT`, pra acordar a tela e tocar o
alarme cheio igual ao comportamento já validado com o app aberto). Se
fosse uma mensagem com bloco `notification`, o Android cuidaria de
mostrar uma notificação padrão sozinho quando o app está em
background, SEM passar pelo código do app -- o que impediria
justamente o comportamento de tela cheia que é o objetivo desta
feature.

TOKEN INVÁLIDO -- `enviar_novo_chamado` levanta `TokenFcmInvalido` (em
vez de só retornar False) especificamente pra esse caso, porque é o
ÚNICO cenário onde quem chama precisa fazer algo a mais (limpar
User.fcm_token no banco, pra não tentar de novo pro mesmo token
morto). Todo outro tipo de falha (Firebase fora do ar, credencial não
configurada, erro de rede) é 100% transparente pra quem chama -- só
retorna False, sem exigir tratamento especial.
"""
import json
import logging
from typing import Any

import firebase_admin
from firebase_admin import credentials, messaging

from app.core.config import settings

logger = logging.getLogger(__name__)

_app: firebase_admin.App | None = None
_inicializacao_falhou = False


class TokenFcmInvalido(Exception):
    """Levantada quando o Firebase confirma que o token não existe
    mais (app desinstalado, token expirado). Quem chama deve limpar
    User.fcm_token pra não tentar de novo."""


def _obter_app() -> firebase_admin.App | None:
    """Inicializa o Firebase Admin SDK na primeira chamada (lazy --
    não faz sentido pagar esse custo no boot do backend se nenhum
    chamado for despachado). Retorna None se não configurado ou se a
    credencial for inválida -- nunca levanta exceção."""
    global _app, _inicializacao_falhou

    if _app is not None:
        return _app
    if _inicializacao_falhou:
        return None

    if not settings.FIREBASE_SERVICE_ACCOUNT_JSON:
        logger.info("Push pulado: FIREBASE_SERVICE_ACCOUNT_JSON não configurada")
        _inicializacao_falhou = True
        return None

    try:
        cred_dict = json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON)
        cred = credentials.Certificate(cred_dict)
        _app = firebase_admin.initialize_app(cred)
    except Exception as exc:
        logger.warning("Falha ao inicializar Firebase Admin SDK: %s", exc)
        _inicializacao_falhou = True
        return None

    return _app


def enviar_novo_chamado(
    *, fcm_token: str, demanda_id: str, cliente_nome: str, endereco_resumo: str
) -> bool:
    """Envia um push data-only avisando de um chamado novo/reatribuído
    pra um motorista específico.

    Retorna True se enviou com sucesso, False pra qualquer falha
    transitória/não configurada (não é erro de quem chama, não
    precisa fazer nada). Levanta TokenFcmInvalido especificamente
    quando o Firebase confirma que o token está morto -- ver docstring
    do módulo."""
    app = _obter_app()
    if app is None:
        return False

    data: dict[str, Any] = {
        "tipo": "novo_chamado",
        "demanda_id": demanda_id,
        "cliente_nome": cliente_nome,
        "endereco": endereco_resumo,
    }

    message = messaging.Message(
        data=data,
        token=fcm_token,
        android=messaging.AndroidConfig(priority="high"),
    )

    try:
        messaging.send(message, app=app)
        return True
    except messaging.UnregisteredError as exc:
        raise TokenFcmInvalido from exc
    except Exception as exc:
        logger.warning("Falha ao enviar push FCM: %s", exc)
        return False
