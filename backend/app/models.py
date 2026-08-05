# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed | 2026-08-04 23:24:33
# Adiciona Module.label + ModuleUpdate, e todos os Pydantic Create/Public models pra geografia, Cliente, Preco e BlocoVale
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from pydantic import EmailStr
from sqlalchemy import Column, DateTime, Numeric, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# RBAC — Role
# ---------------------------------------------------------------------------

class Role(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, max_length=100)
    description: str | None = Field(default=None, max_length=255)

    # cascade_delete=True -- sem isso, o SQLAlchemy tenta zerar a FK das
    # linhas filhas (role_permission.role_id / user_role.role_id) antes
    # de apagar a Role, e como essa FK é parte da chave primária (NOT
    # NULL), a operação quebra com IntegrityError sempre que a role tem
    # ao menos uma permissão ou usuário vinculado (bug encontrado em
    # teste real: DELETE /roles/{id} retornava 503 para roles com
    # RolePermission cadastrado, mas funcionava para roles "vazias").
    user_roles: list["UserRole"] = Relationship(
        back_populates="role", cascade_delete=True
    )
    permissions: list["RolePermission"] = Relationship(
        back_populates="role", cascade_delete=True
    )


# ---------------------------------------------------------------------------
# RBAC — Module
# ---------------------------------------------------------------------------

class Module(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    # Nome de exibição, 100% cosmético -- separado de `name` de
    # propósito. `name` é o slug técnico usado literalmente em
    # require_module_permission("delegacao") no código das rotas;
    # editar isso quebraria qualquer rota que já referencie a string.
    # `label` pode ser editado livremente a qualquer momento (ex:
    # trocar "Delegacao" por "Delegação" com acento) sem esse risco.
    label: str | None = Field(default=None, max_length=255)

    permissions: list["RolePermission"] = Relationship(
        back_populates="module", cascade_delete=True
    )


# ---------------------------------------------------------------------------
# RBAC — RolePermission (matriz role x module x ação)
#
# 4 ações CRUD independentes -- ex: uma role pode criar/editar mas não
# apagar (o exemplo clássico de "Gerente"), o que não era possível
# expressar com o antigo can_read/can_edit único.
# ---------------------------------------------------------------------------

class RolePermission(SQLModel, table=True):
    __tablename__ = "role_permission"

    role_id: uuid.UUID = Field(
        foreign_key="role.id", primary_key=True, ondelete="CASCADE"
    )
    module_id: uuid.UUID = Field(
        foreign_key="module.id", primary_key=True, ondelete="CASCADE"
    )
    can_create: bool = Field(default=False)
    can_read: bool = Field(default=False)
    can_update: bool = Field(default=False)
    can_delete: bool = Field(default=False)

    role: Role = Relationship(back_populates="permissions")
    module: Module = Relationship(back_populates="permissions")


# ---------------------------------------------------------------------------
# RBAC — UserRole (liga User ao Role)
# ---------------------------------------------------------------------------

class UserRole(SQLModel, table=True):
    __tablename__ = "user_role"

    user_id: uuid.UUID = Field(
        foreign_key="user.id", primary_key=True, ondelete="CASCADE"
    )
    role_id: uuid.UUID = Field(
        foreign_key="role.id", primary_key=True, ondelete="CASCADE"
    )

    user: "User" = Relationship(back_populates="roles")
    role: Role = Relationship(back_populates="user_roles")


# ---------------------------------------------------------------------------
# RBAC — Response models (usados pelo endpoint /users/me/permissions)
# ---------------------------------------------------------------------------

class ModulePermission(SQLModel):
    """Permissão efetiva de um usuário em um módulo específico (CRUD)."""
    module: str
    description: str | None = None
    can_create: bool
    can_read: bool
    can_update: bool
    can_delete: bool


class UserPermissions(SQLModel):
    """Resposta completa de permissões do usuário logado."""
    is_superuser: bool
    roles: list[str]
    permissions: list[ModulePermission]


# ---------------------------------------------------------------------------
# RBAC — Response models (usados pela tela de administração de Usuários,
# gestão de roles: listar roles disponíveis e atribuir a um usuário)
# ---------------------------------------------------------------------------

class RolePublic(SQLModel):
    """Role RBAC exposta pra UI (não confundir com is_superuser).

    user_count vem sempre calculado pelo endpoint (não é uma coluna do
    banco) -- usado pela tela "Gerenciar Roles" pra avisar o superuser
    quantos usuários seriam desvinculados antes de confirmar um DELETE
    (a FK UserRole.role_id tem ondelete=CASCADE, então apagar a role
    desvincula silenciosamente se a UI não avisar antes).
    """
    id: uuid.UUID
    name: str
    description: str | None = None
    user_count: int = 0


class RoleCreate(SQLModel):
    """Corpo de POST /roles/ -- cria uma nova role RBAC (ex: 'gerente',
    'motorista'). Nome deve ser único (validado no endpoint)."""
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)


class RoleUpdate(SQLModel):
    """Corpo de PATCH /roles/{role_id} -- edição parcial (nome e/ou
    descrição). Renomear uma role não quebra nada além do óbvio: as
    permissões e vínculos de usuário são por role_id, não por nome."""
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)


class RolesPublic(SQLModel):
    data: list[RolePublic]


class UserRolesUpdate(SQLModel):
    """Corpo de PUT /users/{user_id}/roles -- substitui o conjunto
    inteiro de roles do usuário pelos ids informados (lista vazia
    remove todas as roles)."""
    role_ids: list[uuid.UUID]


# ---------------------------------------------------------------------------
# RBAC — Response models (tela de administração da matriz de
# permissões: Módulo x Role x Ação CRUD)
# ---------------------------------------------------------------------------

class ModulePublic(SQLModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    label: str | None = None


class ModulesPublic(SQLModel):
    data: list[ModulePublic]


class ModuleUpdate(SQLModel):
    """Corpo de PATCH /modules/{module_id} -- edita SÓ label e/ou
    description (campos cosméticos). `name` (o slug técnico) nunca é
    editável por aqui de propósito -- ver comentário na classe Module."""
    label: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class RolePermissionEntry(SQLModel):
    """Uma linha da matriz: o que uma role específica pode fazer no
    módulo (zerado se ainda não houver RolePermission cadastrado)."""
    role_id: uuid.UUID
    role_name: str
    can_create: bool
    can_read: bool
    can_update: bool
    can_delete: bool


class ModulePermissionMatrix(SQLModel):
    module: ModulePublic
    entries: list[RolePermissionEntry]


class RolePermissionUpdate(SQLModel):
    role_id: uuid.UUID
    can_create: bool = False
    can_read: bool = False
    can_update: bool = False
    can_delete: bool = False


class ModulePermissionMatrixUpdate(SQLModel):
    """Corpo de PUT /modules/{module_id}/permissions -- grava a
    matriz inteira do módulo de uma vez (upsert por role)."""
    entries: list[RolePermissionUpdate]


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class UserUpdate(SQLModel):
    email: EmailStr | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    is_superuser: bool | None = None
    full_name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)
    roles: list["UserRole"] = Relationship(back_populates="user", cascade_delete=True)


class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


class UserPublicWithRoles(UserPublic):
    """UserPublic + nomes das roles RBAC atribuídas -- usado pela
    tabela de Usuários na tela de admin, que mostra e permite editar
    as roles de cada um."""
    roles: list[str] = []


class UsersPublicWithRoles(SQLModel):
    data: list[UserPublicWithRoles]
    count: int


# ---------------------------------------------------------------------------
# Item (mantido do template original -- endpoint/tabela seguem se
# chamando "item"/"items" internamente, mas no gasfavero representam
# o catálogo de Produtos; nome técnico e nome de negócio divergem de
# propósito, ver frontend/src/routes/_layout/produtos.tsx)
# ---------------------------------------------------------------------------

class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class ItemCreate(ItemBase):
    pass


class ItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime | None = None


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# ---------------------------------------------------------------------------
# gasfavero — Geografia (Cidade > Bairro > Rua > Endereço)
#
# Bairro fica direto embaixo de Cidade, não de uma "Região" -- a praça
# de entrega do Giovani é organizada por bairro mesmo (sem polígono
# desenhado), então uma camada extra de Região só complicaria sem
# necessidade real hoje. Se um dia precisar de área desenhada à mão
# (não é o caso combinado), isso entra como tabela própria depois,
# sem exigir mudar essa hierarquia.
#
# IMPORTANTE: nenhuma dessas classes declara Relationship() SQLModel
# bidirecional (back_populates) de propósito -- são só FK simples.
# Isso evita reproduzir o mesmo bug já corrigido em Role (SQLAlchemy
# tentando anular FK de filhos carregados em memória antes do delete,
# em vez de deixar o ON DELETE do Postgres agir). Sem Relationship()
# carregada na sessão, não há esse comportamento por trás das costas.
# ---------------------------------------------------------------------------

class Cidade(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    nome: str = Field(unique=True, max_length=255)


class Bairro(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("cidade_id", "nome", name="uq_bairro_cidade_nome"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    cidade_id: uuid.UUID = Field(foreign_key="cidade.id", ondelete="CASCADE")
    nome: str = Field(max_length=255)


class Rua(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("bairro_id", "nome", name="uq_rua_bairro_nome"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    bairro_id: uuid.UUID = Field(foreign_key="bairro.id", ondelete="CASCADE")
    # "cresce por uso": além do seed inicial, uma rua nova é criada na
    # hora que alguém cadastra o primeiro endereço nela -- ninguém
    # conhece as ruas de Veranópolis melhor que quem mora/trabalha lá.
    nome: str = Field(max_length=255)


class Endereco(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    rua_id: uuid.UUID = Field(foreign_key="rua.id", ondelete="RESTRICT")
    # string, não int -- endereço brasileiro às vezes é "s/n", "123A"
    # etc, não vale a pena forçar numérico puro
    numero: str = Field(max_length=20)
    complemento: str | None = Field(default=None, max_length=255)
    created_at: datetime = Field(
        default_factory=get_datetime_utc, sa_type=DateTime(timezone=True)
    )


# ---- Response/Create models de geografia (endpoints em geografia.py) ----

class BairroPublic(SQLModel):
    id: uuid.UUID
    nome: str


class BairrosPublic(SQLModel):
    data: list[BairroPublic]


class RuaPublic(SQLModel):
    id: uuid.UUID
    nome: str


class RuasPublic(SQLModel):
    data: list[RuaPublic]


class EnderecoCreate(SQLModel):
    """Corpo usado para criar (ou trocar) o endereço de um cliente.

    rua_nome é sempre texto livre, nunca um rua_id -- o endpoint
    resolve pra uma Rua existente (case-insensitive, mesmo bairro) ou
    cria uma nova na hora ("cresce por uso"). Isso evita o frontend
    precisar gerenciar o caso "rua não existe ainda no catálogo".
    """
    bairro_id: uuid.UUID
    rua_nome: str = Field(min_length=1, max_length=255)
    numero: str = Field(min_length=1, max_length=20)
    complemento: str | None = Field(default=None, max_length=255)


class EnderecoPublic(SQLModel):
    id: uuid.UUID
    numero: str
    complemento: str | None = None
    rua_nome: str
    bairro_nome: str
    cidade_nome: str


# ---------------------------------------------------------------------------
# gasfavero — Cliente + histórico de endereço
#
# Cliente e Endereço são entidades distintas (pessoas mudam de casa) --
# ClienteEndereco é o histórico: valid_to NULL = endereço vigente
# agora. Nunca dar UPDATE num endereço vigente pra trocar de casa;
# sempre fechar o registro antigo (valid_to = agora) e abrir um novo.
# Um índice único parcial (na migration) garante que só existe 1 linha
# vigente por cliente ao mesmo tempo -- histórico linear, sem endereços
# simultâneos (decisão confirmada com o Ricardo).
# ---------------------------------------------------------------------------

class Cliente(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    nome: str = Field(max_length=255)
    cpf: str = Field(unique=True, max_length=14, index=True)
    created_at: datetime = Field(
        default_factory=get_datetime_utc, sa_type=DateTime(timezone=True)
    )


class ClienteEndereco(SQLModel, table=True):
    __tablename__ = "cliente_endereco"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    cliente_id: uuid.UUID = Field(foreign_key="cliente.id", ondelete="CASCADE")
    endereco_id: uuid.UUID = Field(foreign_key="endereco.id", ondelete="RESTRICT")
    valid_from: datetime = Field(
        default_factory=get_datetime_utc, sa_type=DateTime(timezone=True)
    )
    # NULL = vigente agora. Fechar (setar valid_to) ao trocar de
    # endereço, nunca apagar a linha antiga -- é o histórico.
    valid_to: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))


# ---- Response/Create models de Cliente (endpoints em clientes.py) ----

class ClienteCreate(SQLModel):
    """Corpo de POST /clientes/ -- cria cliente + endereço + o vínculo
    cliente_endereco (valid_to NULL) numa única chamada, espelhando o
    fluxo real: motorista cadastra cliente já com o endereço."""
    nome: str = Field(min_length=1, max_length=255)
    cpf: str = Field(min_length=11, max_length=14)
    endereco: EnderecoCreate


class ClienteUpdate(SQLModel):
    """Edição só dos dados do próprio cliente (nome/cpf). Trocar de
    endereço é um endpoint separado (POST /clientes/{id}/endereco),
    porque isso precisa fechar o histórico, não é um UPDATE simples."""
    nome: str | None = Field(default=None, min_length=1, max_length=255)
    cpf: str | None = Field(default=None, min_length=11, max_length=14)


class ClientePublic(SQLModel):
    id: uuid.UUID
    nome: str
    cpf: str
    created_at: datetime
    endereco: EnderecoPublic | None = None


class ClientesPublic(SQLModel):
    data: list[ClientePublic]
    count: int


# ---------------------------------------------------------------------------
# gasfavero — Preço (histórico de vigência)
#
# Preço tem vigência por data (não é um valor único sobrescrito) --
# quando o gerente cadastra um preço novo pra um produto, fecha o
# registro vigente anterior (valid_to = agora) e abre um novo. A Venda
# (item ainda não modelado, de propósito) vai referenciar o preco_id
# vigente no momento pra "congelar" o valor praticado -- mudar o preço
# depois não altera o valor de vendas já feitas.
# ---------------------------------------------------------------------------

class Preco(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    produto_id: uuid.UUID = Field(foreign_key="item.id", ondelete="CASCADE")
    valor: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    valid_from: datetime = Field(
        default_factory=get_datetime_utc, sa_type=DateTime(timezone=True)
    )
    valid_to: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))


# ---- Response/Create models de Preço (endpoints em precos.py) ----

class PrecoCreate(SQLModel):
    """Corpo de POST /produtos/{produto_id}/preco -- cadastra um novo
    preço vigente pro produto (fecha o anterior automaticamente)."""
    valor: Decimal = Field(gt=0, decimal_places=2)


class PrecoPublic(SQLModel):
    id: uuid.UUID
    valor: Decimal
    valid_from: datetime


class ProdutoComPrecoPublic(SQLModel):
    """Produto + preço vigente -- usado pela tela 'Cadastro de
    Preços', que é 'parecida com Produto' só que atribuindo preço."""
    id: uuid.UUID
    title: str
    description: str | None = None
    preco_atual: Decimal | None = None
    preco_valid_from: datetime | None = None


class ProdutosComPrecoPublic(SQLModel):
    data: list[ProdutoComPrecoPublic]


# ---------------------------------------------------------------------------
# gasfavero — Bloco de Vale + Vale
#
# BlocoVale.motorista_id é fixo desde a criação (decisão confirmada) --
# se atribuir errado, a correção é apagar e recriar o bloco, não editar
# o motorista responsável.
#
# Vale.numero é único em TODO o sistema (decisão confirmada), não só
# dentro do bloco -- por isso é uma constraint unique de banco, não só
# validação de aplicação. Ao cadastrar um BlocoVale (primeira/última
# folha), o endpoint que vai criar isso (item 6 da lista, ainda não
# implementado) gera uma linha Vale pra cada número da sequência.
# ---------------------------------------------------------------------------

class BlocoVale(SQLModel, table=True):
    __tablename__ = "bloco_vale"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    motorista_id: uuid.UUID = Field(foreign_key="user.id", ondelete="RESTRICT")
    primeira_folha: int
    ultima_folha: int
    created_at: datetime = Field(
        default_factory=get_datetime_utc, sa_type=DateTime(timezone=True)
    )


class Vale(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    numero: int = Field(unique=True, index=True)
    bloco_id: uuid.UUID = Field(foreign_key="bloco_vale.id", ondelete="CASCADE")


# ---- Response/Create models de Bloco de Vale (endpoints em vales.py) ----

class BlocoValeCreate(SQLModel):
    """Corpo de POST /blocos-vale/ -- cria o bloco E já atribui o
    motorista na mesma chamada (motorista é fixo desde a criação,
    decisão confirmada -- não existe endpoint pra reatribuir depois).
    Gera automaticamente uma linha Vale pra cada número entre
    primeira_folha e ultima_folha (inclusive)."""
    motorista_id: uuid.UUID
    primeira_folha: int = Field(gt=0)
    ultima_folha: int = Field(gt=0)


class BlocoValePublic(SQLModel):
    id: uuid.UUID
    motorista_id: uuid.UUID
    motorista_nome: str
    primeira_folha: int
    ultima_folha: int
    total_vales: int
    created_at: datetime


class BlocosValePublic(SQLModel):
    data: list[BlocoValePublic]


# ---------------------------------------------------------------------------
# Auth / Token
# ---------------------------------------------------------------------------

class Message(SQLModel):
    message: str


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
