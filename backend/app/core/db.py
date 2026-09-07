# [mcp-local harness] feature: fix-seed-motorista-ilike | plano: 494954ab | 2026-09-07 20:35:09
# db.py: seed RBAC com ilike para motorista, todos os módulos gasfavero com permissões explícitas por role
import uuid

from sqlmodel import Session, create_engine, select
from sqlalchemy import func as sa_func

from app import crud
from app.core.config import settings
from app.models import Module, Role, RolePermission, User, UserCreate, UserRole

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


DEFAULT_ROLES = [
    {"name": "admin",     "description": "Acesso irrestrito a todos os módulos"},
    {"name": "editor",    "description": "Cria e edita nos módulos permitidos, mas não apaga"},
    {"name": "viewer",    "description": "Somente leitura nos módulos permitidos"},
]

DEFAULT_MODULES = [
    {"name": "usuarios",       "description": "Gestão de usuários e permissões"},
    {"name": "configuracoes",  "description": "Configurações gerais do sistema"},
]

# ---------------------------------------------------------------------------
# Módulos extras do erp-gasfavero com permissões por role
#
# Formato: {"name": "modulo", "gerente": (C,R,U,D), "motorista": (C,R,U,D)}
# ---------------------------------------------------------------------------

GASFAVERO_MODULES_RBAC = [
    # Módulo          gerente            motorista
    {"name": "cascos",       "gerente": (True, True, True, True),  "motorista": (True,  True, True,  False)},
    {"name": "gas_povo",     "gerente": (True, True, True, True),  "motorista": (True,  True, True,  False)},
    {"name": "vendas",       "gerente": (True, True, True, True),  "motorista": (True,  True, True,  False)},
    {"name": "produtos",     "gerente": (True, True, True, True),  "motorista": (False, True, False, False)},
    {"name": "clientes",     "gerente": (True, True, True, True),  "motorista": (True,  True, True,  False)},
    {"name": "delegacao",    "gerente": (True, True, True, True),  "motorista": (False, True, True,  False)},
    {"name": "vale_gas",     "gerente": (True, True, True, True),  "motorista": (False, True, False, False)},
    {"name": "vales",        "gerente": (True, True, True, True),  "motorista": (False, True, False, False)},
    {"name": "livro_vendas", "gerente": (True, True, True, True),  "motorista": (False, True, False, False)},
    {"name": "inadimplencia","gerente": (True, True, True, True),  "motorista": (False, True, False, False)},
    {"name": "fechamento",   "gerente": (True, True, True, True),  "motorista": (False, True, False, False)},
    {"name": "mapa",         "gerente": (True, True, True, True),  "motorista": (False, True, False, False)},
]


def _get_or_create_role(session: Session, name: str, description: str) -> Role:
    role = session.exec(select(Role).where(Role.name == name)).first()
    if not role:
        role = Role(id=uuid.uuid4(), name=name, description=description)
        session.add(role)
        session.flush()
    return role


def _get_or_create_module(session: Session, name: str, description: str) -> Module:
    module = session.exec(select(Module).where(Module.name == name)).first()
    if not module:
        module = Module(id=uuid.uuid4(), name=name, description=description)
        session.add(module)
        session.flush()
    return module


def _ensure_role_permission(
    session: Session,
    role: Role,
    module: Module,
    can_create: bool,
    can_read: bool,
    can_update: bool,
    can_delete: bool,
) -> None:
    perm = session.exec(
        select(RolePermission)
        .where(RolePermission.role_id == role.id)
        .where(RolePermission.module_id == module.id)
    ).first()
    if not perm:
        perm = RolePermission(
            role_id=role.id,
            module_id=module.id,
            can_create=can_create,
            can_read=can_read,
            can_update=can_update,
            can_delete=can_delete,
        )
        session.add(perm)
    # Se já existe, não sobrescreve (permissões podem ter sido ajustadas manualmente)


def _ensure_user_role(session: Session, user: User, role: Role) -> None:
    exists = session.exec(
        select(UserRole)
        .where(UserRole.user_id == user.id)
        .where(UserRole.role_id == role.id)
    ).first()
    if not exists:
        session.add(UserRole(user_id=user.id, role_id=role.id))


def init_db(session: Session) -> None:
    user = session.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
        )
        user = crud.create_user(session=session, user_create=user_in)

    roles: dict[str, Role] = {}
    for r in DEFAULT_ROLES:
        roles[r["name"]] = _get_or_create_role(session, r["name"], r["description"])

    modules: dict[str, Module] = {}
    for m in DEFAULT_MODULES:
        modules[m["name"]] = _get_or_create_module(session, m["name"], m["description"])

    for module in modules.values():
        _ensure_role_permission(session, roles["admin"], module, True, True, True, True)
        _ensure_role_permission(session, roles["editor"], module, True, True, True, False)
        _ensure_role_permission(session, roles["viewer"], module, False, True, False, False)

    _ensure_user_role(session, user, roles["admin"])

    # Busca case-insensitive — o role pode ter sido criado como "Motorista" ou "motorista"
    role_gerente = session.exec(
        select(Role).where(sa_func.lower(Role.name) == "gerente")
    ).first()
    role_motorista = session.exec(
        select(Role).where(sa_func.lower(Role.name) == "motorista")
    ).first()

    for entry in GASFAVERO_MODULES_RBAC:
        mod_name = entry["name"]
        mod = _get_or_create_module(session, mod_name, mod_name)

        # admin sempre tem tudo
        _ensure_role_permission(session, roles["admin"], mod, True, True, True, True)

        if role_gerente:
            c, r, u, d = entry["gerente"]
            _ensure_role_permission(session, role_gerente, mod, c, r, u, d)

        if role_motorista:
            c, r, u, d = entry["motorista"]
            _ensure_role_permission(session, role_motorista, mod, c, r, u, d)

    session.commit()
