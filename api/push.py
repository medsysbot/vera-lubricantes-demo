from __future__ import annotations

import json

from pywebpush import WebPushException, webpush

from api.config import Settings


def send_web_push(
    *,
    endpoint: str,
    p256dh: str,
    auth: str,
    payload: dict,
    settings: Settings,
) -> None:
    subscription = {
        "endpoint": endpoint,
        "keys": {
            "p256dh": p256dh,
            "auth": auth,
        },
    }

    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
        )
    except WebPushException:
        raise
