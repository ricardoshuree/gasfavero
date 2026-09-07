# [mcp-local harness] feature: emprestimo_casco | plano: 1c0b80ad | 2026-09-07 15:11:12
# Adiciona módulo cascos no seed RBAC: gerente CRUD completo, motorista sem can_delete (não confirma)
import uuid

from sqlmodel import Session, create_engine, select

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
# Módulos extras do erp-gasfavero
#
# cascos:
#   gerente  -> CRUD completo (recebe E confirma a devolucao — dupla checagem)
#   motorista -> create+read+update (registra emprestimo e recebe casco, mas NAO confirma)
#                can_delete=False -> nao acessa PATCH /cascos/{id}/confirmar
# ---------------------------------------------------------------------------

GASFAVERO_EXTRA_MODULES = [
    {"name": "gas_povo", "description": "Programa Gás do Povo — vendas e recebimento"},
    {"name": "cascos",   "description": "Controle de empréstimo e devolução de cascos"},
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
        _ensure_role_permission(
            session, roles["admin"], module,
            can_create=True, can_read=True, can_update=True, can_delete=True,
        )
        _ensure_role_permission(
            session, roles["editor"], module,
            can_create=True, can_read=True, can_update=True, can_delete=False,
        )
        _ensure_role_permission(
            session, roles["viewer"], module,
            can_create=False, can_read=True, can_update=False, can_delete=False,
        )

    _ensure_user_role(session, user, roles["admin"])

    role_gerente = session.exec(select(Role).where(Role.name == "gerente")).first()
    role_motorista = session.exec(select(Role).where(Role.name == "motorista")).first()

    for m in GASFAVERO_EXTRA_MODULES:
        mod = _get_or_create_module(session, m["name"], m["description"])

        _ensure_role_permission(
            session, roles["admin"], mod,
            can_create=True, can_read=True, can_update=True, can_delete=True,
        )

        if role_gerente:
            _ensure_role_permission(
                session, role_gerente, mod,
                can_create=True, can_read=True, can_update=True, can_delete=True,
            )

        if role_motorista:
            # Motorista NAO pode confirmar devolucao (can_delete=False)
            # Isso bloqueia PATCH /cascos/{id}/confirmar que exige can_delete
            can_delete = m["name"] != "cascos"
            _ensure_role_permission(
                session, role_motorista, mod,
                can_create=True, can_read=True, can_update=True, can_delete=can_delete,
            )

    session.commit()
