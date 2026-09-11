from __future__ import annotations

import json
import logging

from pywebpush import WebPushException, webpush

from api.config import settings

logger = logging.getLogger(__name__)


def push_is_configured() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key and settings.vapid_subject)


def send_push(subscription: dict, payload: dict) -> bool:
    if not push_is_configured():
        return False
    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
        )
        return True
    except WebPushException:
        logger.exception("No se pudo enviar Web Push")
        return False
