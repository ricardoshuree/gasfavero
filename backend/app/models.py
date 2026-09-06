# [mcp-local harness] feature: gas-povo | plano: 8ec9cbb7 | 2026-09-06 00:03:46
# Adiciona campos gas_povo_frete e gas_povo_frete_recebido_em em Venda/VendaCreate/VendaPublic; adiciona gas_povo no Literal; adiciona modelos GasPovoRecebimentoPublic
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal

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
    user_roles: list["UserRole"] = Relationship(back_populates="role", cascade_delete=True)
    permissions: list["RolePermission"] = Relationship(back_populates="role", cascade_delete=True)


class Module(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    label: str | None = Field(default=None, max_length=255)
    permissions: list["RolePermission"] = Relationship(back_populates="module", cascade_delete=True)


class RolePermission(SQLModel, table=True):
    __tablename__ = "role_permission"
    role_id: uuid.UUID = Field(foreign_key="role.id", primary_key=True, ondelete="CASCADE")
    module_id: uuid.UUID = Field(foreign_key="module.id", primary_key=True, ondelete="CASCADE")
    can_create: bool = Field(default=False)
    can_read: bool = Field(default=False)
    can_update: bool = Field(default=False)
    can_delete: bool = Field(default=False)
    role: Role = Relationship(back_populates="permissions")
    module: Module = Relationship(back_populates="permissions")


class UserRole(SQLModel, table=True):
    __tablename__ = "user_role"
    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True, ondelete="CASCADE")
    role_id: uuid.UUID = Field(foreign_key="role.id", primary_key=True, ondelete="CASCADE")
    user: "User" = Relationship(back_populates="roles")
    role: Role = Relationship(back_populates="user_roles")


class ModulePermission(SQLModel):
    module: str
    description: str | None = None
    can_create: bool
    can_read: bool
    can_update: bool
    can_delete: bool


class UserPermissions(SQLModel):
    is_superuser: bool
    roles: list[str]
    permissions: list[ModulePermission]


class RolePublic(SQLModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    user_count: int = 0


class RoleCreate(SQLModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)


class RoleUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)


class RolesPublic(SQLModel):
    data: list[RolePublic]


class UserRolesUpdate(SQLModel):
    role_ids: list[uuid.UUID]


class ModulePublic(SQLModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    label: str | None = None


class ModulesPublic(SQLModel):
    data: list[ModulePublic]


class ModuleUpdate(SQLModel):
    label: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class RolePermissionEntry(SQLModel):
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
    disponivel: bool = Field(default=True)
    fcm_token: str | None = Field(default=None, max_length=255)
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)
    roles: list["UserRole"] = Relationship(back_populates="user", cascade_delete=True)


class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


class UserPublicWithRoles(UserPublic):
    roles: list[str] = []


class UsersPublicWithRoles(SQLModel):
    data: list[UserPublicWithRoles]
    count: int


# ---------------------------------------------------------------------------
# Item
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
    owner_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")
    owner: User | None = Relationship(back_populates="items")


class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime | None = None


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# ---------------------------------------------------------------------------
# Geografia
# ---------------------------------------------------------------------------

class Cidade(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    nome: str = Field(unique=True, max_length=255)


class Bairro(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("cidade_id", "nome", name="uq_bairro_cidade_nome"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    cidade_id: uuid.UUID = Field(foreign_key="cidade.id", ondelete="CASCADE")
    nome: str = Field(max_length=255)


class Rua(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("bairro_id", "nome", name="uq_rua_bairro_nome"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    bairro_id: uuid.UUID = Field(foreign_key="bairro.id", ondelete="CASCADE")
    nome: str = Field(max_length=255)


class LogradouroReferencia(SQLModel, table=True):
    __tablename__ = "logradouro_referencia"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    nome: str = Field(unique=True, max_length=255)


class Endereco(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    rua_id: uuid.UUID = Field(foreign_key="rua.id", ondelete="RESTRICT")
    numero: str = Field(max_length=20)
    complemento: str | None = Field(default=None, max_length=255)
    latitude: Decimal | None = Field(default=None, sa_column=Column(Numeric(9, 6), nullable=True))
    longitude: Decimal | None = Field(default=None, sa_column=Column(Numeric(9, 6), nullable=True))
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


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


class LogradouroReferenciaPublic(SQLModel):
    id: uuid.UUID
    nome: str


class LogradourosReferenciaPublic(SQLModel):
    data: list[LogradouroReferenciaPublic]


class EnderecoCreate(SQLModel):
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
    latitude: Decimal | None = None
    longitude: Decimal | None = None


# ---------------------------------------------------------------------------
# Cliente
# ---------------------------------------------------------------------------

class Cliente(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    nome: str = Field(max_length=255)
    cpf: str = Field(unique=True, max_length=14, index=True)
    telefone: str | None = Field(default=None, max_length=20)
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


class ClienteEndereco(SQLModel, table=True):
    __tablename__ = "cliente_endereco"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    cliente_id: uuid.UUID = Field(foreign_key="cliente.id", ondelete="CASCADE")
    endereco_id: uuid.UUID = Field(foreign_key="endereco.id", ondelete="RESTRICT")
    valid_from: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    valid_to: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))


class ClienteCreate(SQLModel):
    nome: str = Field(min_length=1, max_length=255)
    cpf: str = Field(min_length=11, max_length=14)
    telefone: str | None = Field(default=None, max_length=20)
    endereco: EnderecoCreate | None = None


class ClienteUpdate(SQLModel):
    nome: str | None = Field(default=None, min_length=1, max_length=255)
    cpf: str | None = Field(default=None, min_length=11, max_length=14)
    telefone: str | None = Field(default=None, max_length=20)


class ClientePublic(SQLModel):
    id: uuid.UUID
    nome: str
    cpf: str
    telefone: str | None = None
    created_at: datetime
    endereco: EnderecoPublic | None = None


class ClientesPublic(SQLModel):
    data: list[ClientePublic]
    count: int


# ---------------------------------------------------------------------------
# Preco
# ---------------------------------------------------------------------------

class Preco(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    produto_id: uuid.UUID = Field(foreign_key="item.id", ondelete="CASCADE")
    valor: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    valid_from: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    valid_to: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))


class PrecoCreate(SQLModel):
    valor: Decimal = Field(gt=0, decimal_places=2)


class PrecoPublic(SQLModel):
    id: uuid.UUID
    valor: Decimal
    valid_from: datetime


class ProdutoComPrecoPublic(SQLModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    preco_atual: Decimal | None = None
    preco_valid_from: datetime | None = None


class ProdutosComPrecoPublic(SQLModel):
    data: list[ProdutoComPrecoPublic]


# ---------------------------------------------------------------------------
# Bloco de Vale (fiado dos motoristas)
# ---------------------------------------------------------------------------

class BlocoVale(SQLModel, table=True):
    __tablename__ = "bloco_vale"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    motorista_id: uuid.UUID = Field(foreign_key="user.id", ondelete="RESTRICT")
    primeira_folha: int
    ultima_folha: int
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


class Vale(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    numero: int = Field(unique=True, index=True)
    bloco_id: uuid.UUID = Field(foreign_key="bloco_vale.id", ondelete="CASCADE")


class BlocoValeCreate(SQLModel):
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
# Venda
# ---------------------------------------------------------------------------

class Venda(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    cliente_id: uuid.UUID = Field(foreign_key="cliente.id", ondelete="RESTRICT")
    endereco_id: uuid.UUID | None = Field(default=None, foreign_key="endereco.id", ondelete="SET NULL")
    motorista_id: uuid.UUID = Field(foreign_key="user.id", ondelete="RESTRICT")
    forma_pagamento: str = Field(max_length=20)
    vale_id: uuid.UUID | None = Field(default=None, foreign_key="vale.id", ondelete="RESTRICT")
    data_pagamento_vale: date | None = Field(default=None)
    # Campos para Vale Gas (migration s4t5u6v7w8x9)
    vale_gas_numero: int | None = Field(default=None)
    vale_gas_bloco_id: uuid.UUID | None = Field(
        default=None, foreign_key="bloco_vale_gas.id", ondelete="RESTRICT"
    )
    # Campos para Gas do Povo (migration u6v7w8x9y0z1)
    # gas_povo_frete: frete cobrado do cliente no ato da entrega (pago imediatamente)
    # gas_povo_frete_recebido_em: preenchido automaticamente na criacao da venda
    # pago_em (existente): preenchido quando o governo pagar o valor principal
    gas_povo_frete: Decimal | None = Field(default=None, sa_column=Column(Numeric(10, 2), nullable=True))
    gas_povo_frete_recebido_em: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    valor_total: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    valor_pago: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    data_venda: date = Field(default_factory=lambda: datetime.now(UTC).date())
    pago_em: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    recebido_em: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    recebido_por_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
    criado_por_id: uuid.UUID = Field(foreign_key="user.id", ondelete="RESTRICT")
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


class VendaItem(SQLModel, table=True):
    __tablename__ = "venda_item"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    venda_id: uuid.UUID = Field(foreign_key="venda.id", ondelete="CASCADE")
    produto_id: uuid.UUID = Field(foreign_key="item.id", ondelete="RESTRICT")
    preco_id: uuid.UUID = Field(foreign_key="preco.id", ondelete="RESTRICT")
    quantidade: int
    subtotal: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))


class VendaItemCreate(SQLModel):
    produto_id: uuid.UUID
    quantidade: int = Field(gt=0)


class VendaCreate(SQLModel):
    cliente_id: uuid.UUID
    endereco_id: uuid.UUID | None = None
    motorista_id: uuid.UUID
    forma_pagamento: Literal["cartao_debito", "cartao_credito", "pix", "dinheiro", "vale", "vale_gas", "gas_povo"]
    vale_numero: int | None = None
    data_pagamento_vale: date | None = None
    # Campos para Vale Gas
    vale_gas_numero: int | None = None
    vale_gas_bloco_id: uuid.UUID | None = None
    # Campos para Gas do Povo
    gas_povo_frete: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    valor_pago: Decimal = Field(gt=0, decimal_places=2)
    data_venda: date | None = None
    itens: list[VendaItemCreate] = Field(min_length=1)


class VendaItemPublic(SQLModel):
    id: uuid.UUID
    produto_id: uuid.UUID
    produto_title: str
    quantidade: int
    preco_unitario: Decimal
    subtotal: Decimal


class VendaPublic(SQLModel):
    id: uuid.UUID
    cliente_id: uuid.UUID
    cliente_nome: str
    endereco: EnderecoPublic | None = None
    motorista_id: uuid.UUID
    motorista_nome: str
    forma_pagamento: str
    vale_numero: int | None = None
    data_pagamento_vale: date | None = None
    vale_gas_numero: int | None = None
    vale_gas_estabelecimento: str | None = None
    # Gas do Povo
    gas_povo_frete: Decimal | None = None
    gas_povo_frete_recebido_em: datetime | None = None
    valor_total: Decimal
    valor_pago: Decimal
    data_venda: date
    pago_em: datetime | None = None
    recebido_em: datetime | None = None
    recebido_por_nome: str | None = None
    criado_por_id: uuid.UUID
    created_at: datetime
    itens: list[VendaItemPublic] = []


class VendasPublic(SQLModel):
    data: list[VendaPublic]
    count: int


class ProximoValeNumeroPublic(SQLModel):
    numero: int | None = None


class VendaMarcarPagoRequest(SQLModel):
    valor_pago: Decimal = Field(gt=0, decimal_places=2)


class VendaBaixarValeRequest(SQLModel):
    valor_pago: Decimal | None = Field(default=None, gt=0, decimal_places=2)


class ResumoRecebimentoValePublic(SQLModel):
    em_aberto_qtd: int
    em_aberto_valor: Decimal
    atraso_qtd: int
    atraso_valor: Decimal
    aguardando_baixa_qtd: int
    aguardando_baixa_valor: Decimal
    pagos_mes_qtd: int
    pagos_mes_valor: Decimal


class LivroVendasBucket(SQLModel):
    label: str
    valor: Decimal


class LivroVendasFormaPagamentoValor(SQLModel):
    forma_pagamento: str
    valor: Decimal


class LivroVendasResumoPublic(SQLModel):
    em_caixa_qtd: int
    em_caixa_valor: Decimal
    em_caixa_por_forma_pagamento: list[LivroVendasFormaPagamentoValor]
    em_aberto_qtd: int
    em_aberto_valor: Decimal
    periodo_inicio: date
    periodo_fim: date
    grafico: list[LivroVendasBucket]


class AnosDisponiveisPublic(SQLModel):
    anos: list[int]


class LivroVendasListPublic(SQLModel):
    data: list[VendaPublic]
    count: int
    soma_preco: Decimal
    soma_valor_pago: Decimal


class RankingMotoristaPublic(SQLModel):
    motorista_id: uuid.UUID
    motorista_nome: str
    quantidade: int


class RankingSemanaPublic(SQLModel):
    periodo_inicio: date
    periodo_fim: date
    motoristas: list[RankingMotoristaPublic]


class InadimplentesResumoPublic(SQLModel):
    qtd: int
    valor: Decimal
    periodo_inicio: date
    periodo_fim: date
    grafico: list[LivroVendasBucket]


class InadimplentesMotoristaPublic(SQLModel):
    id: uuid.UUID
    nome: str


class InadimplentesMotoristasPublic(SQLModel):
    data: list[InadimplentesMotoristaPublic]


# ---------------------------------------------------------------------------
# Chamado (DemandaVenda)
# ---------------------------------------------------------------------------

class DemandaVenda(SQLModel, table=True):
    __tablename__ = "demanda_venda"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    cliente_id: uuid.UUID = Field(foreign_key="cliente.id", ondelete="RESTRICT")
    endereco_id: uuid.UUID = Field(foreign_key="endereco.id", ondelete="RESTRICT")
    motorista_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", ondelete="RESTRICT")
    observacao: str | None = Field(default=None, max_length=500)
    status: str = Field(default="pendente", max_length=20)
    criado_por_id: uuid.UUID = Field(foreign_key="user.id", ondelete="RESTRICT")
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    respondida_em: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    finalizada_em: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))


class DemandaVendaItem(SQLModel, table=True):
    __tablename__ = "demanda_venda_item"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    demanda_id: uuid.UUID = Field(foreign_key="demanda_venda.id", ondelete="CASCADE")
    produto_id: uuid.UUID = Field(foreign_key="item.id", ondelete="RESTRICT")
    quantidade: int


class MotoristaLocalizacao(SQLModel, table=True):
    __tablename__ = "motorista_localizacao"
    motorista_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True, ondelete="CASCADE")
    latitude: Decimal = Field(sa_column=Column(Numeric(9, 6), nullable=False))
    longitude: Decimal = Field(sa_column=Column(Numeric(9, 6), nullable=False))
    atualizado_em: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


class DemandaVendaItemCreate(SQLModel):
    produto_id: uuid.UUID
    quantidade: int = Field(gt=0)


class DemandaVendaItemPublic(SQLModel):
    id: uuid.UUID
    produto_id: uuid.UUID
    produto_title: str
    quantidade: int


class DemandaVendaCreate(SQLModel):
    cliente_id: uuid.UUID
    endereco_id: uuid.UUID
    motorista_id: uuid.UUID | None = None
    observacao: str | None = Field(default=None, max_length=500)
    itens: list[DemandaVendaItemCreate] = []


class DemandaVendaAceitarRequest(SQLModel):
    motorista_id: uuid.UUID | None = None


class DemandaVendaReatribuirRequest(SQLModel):
    motorista_id: uuid.UUID | None = None


class DemandaVendaPublic(SQLModel):
    id: uuid.UUID
    cliente_id: uuid.UUID
    cliente_nome: str
    endereco: EnderecoPublic
    motorista_id: uuid.UUID | None = None
    motorista_nome: str | None = None
    observacao: str | None = None
    status: str
    criado_por_id: uuid.UUID
    created_at: datetime
    respondida_em: datetime | None = None
    finalizada_em: datetime | None = None
    itens: list[DemandaVendaItemPublic] = []


class DemandasVendaPublic(SQLModel):
    data: list[DemandaVendaPublic]


class MotoristaLocalizacaoUpdate(SQLModel):
    latitude: Decimal = Field(ge=-90, le=90, decimal_places=6)
    longitude: Decimal = Field(ge=-180, le=180, decimal_places=6)


class MotoristaLocalizacaoPublic(SQLModel):
    motorista_id: uuid.UUID
    motorista_nome: str
    latitude: Decimal
    longitude: Decimal
    atualizado_em: datetime


class MotoristasLocalizacaoPublic(SQLModel):
    data: list[MotoristaLocalizacaoPublic]


class MotoristaDisponibilidadeUpdate(SQLModel):
    disponivel: bool


class MotoristaDisponibilidadePublic(SQLModel):
    motorista_id: uuid.UUID
    motorista_nome: str
    disponivel: bool


class MotoristasDisponibilidadePublic(SQLModel):
    data: list[MotoristaDisponibilidadePublic]


class MotoristaFcmTokenUpdate(SQLModel):
    fcm_token: str = Field(min_length=1, max_length=255)


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


# ---------------------------------------------------------------------------
# Plano de Contas + Lancamento Contabil
# ---------------------------------------------------------------------------

class Conta(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    numero: str = Field(unique=True, max_length=10)
    nome: str = Field(max_length=255)
    tipo: str = Field(max_length=20)
    pai_id: uuid.UUID | None = Field(default=None, foreign_key="conta.id", ondelete="RESTRICT")
    motorista_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", ondelete="RESTRICT")
    ativo: bool = Field(default=True)
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


class LancamentoContabil(SQLModel, table=True):
    __tablename__ = "lancamento_contabil"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    data: date = Field()
    descricao: str = Field(max_length=500)
    valor: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    debito_id: uuid.UUID = Field(foreign_key="conta.id", ondelete="RESTRICT")
    credito_id: uuid.UUID = Field(foreign_key="conta.id", ondelete="RESTRICT")
    venda_id: uuid.UUID | None = Field(default=None, foreign_key="venda.id", ondelete="SET NULL")
    abertura_id: uuid.UUID | None = Field(default=None)
    criado_por_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", ondelete="RESTRICT")
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


class ContaPublic(SQLModel):
    id: uuid.UUID
    numero: str
    nome: str
    tipo: str
    pai_id: uuid.UUID | None = None
    motorista_id: uuid.UUID | None = None
    motorista_nome: str | None = None
    ativo: bool
    saldo: Decimal = Decimal("0")


class ContasPublic(SQLModel):
    data: list[ContaPublic]


class LancamentoContabilPublic(SQLModel):
    id: uuid.UUID
    data: date
    descricao: str
    valor: Decimal
    debito_numero: str
    debito_nome: str
    credito_numero: str
    credito_nome: str
    venda_id: uuid.UUID | None = None
    abertura_id: uuid.UUID | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Bloco de Vale Gas
# ---------------------------------------------------------------------------

class BlocoValeGas(SQLModel, table=True):
    __tablename__ = "bloco_vale_gas"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    cliente_id: uuid.UUID = Field(foreign_key="cliente.id", ondelete="RESTRICT", unique=True)
    primeira_folha: int
    ultima_folha: int
    data: date
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


class BlocoValeGasCreate(SQLModel):
    cliente_id: uuid.UUID
    primeira_folha: int = Field(gt=0)
    ultima_folha: int = Field(gt=0)
    data: date


class BlocoValeGasPublic(SQLModel):
    id: uuid.UUID
    cliente_id: uuid.UUID
    cliente_nome: str
    cliente_cpf: str
    primeira_folha: int
    ultima_folha: int
    total_folhas: int
    data: date
    created_at: datetime


class BlocosValeGasPublic(SQLModel):
    data: list[BlocoValeGasPublic]


# ---------------------------------------------------------------------------
# Gas do Povo — Recebimento
# ---------------------------------------------------------------------------

class GasPovoVendaPublic(SQLModel):
    """Venda Gas do Povo com dados relevantes para o painel de recebimento."""
    id: uuid.UUID
    cliente_id: uuid.UUID
    cliente_nome: str
    motorista_nome: str
    valor_total: Decimal
    gas_povo_frete: Decimal
    gas_povo_frete_recebido_em: datetime
    data_venda: date
    pago_em: datetime | None = None
    dias_em_aberto: int


class GasPovoRecebimentoPublic(SQLModel):
    pendentes: list[GasPovoVendaPublic]
    pendentes_qtd: int
    pendentes_valor: Decimal
    recebidos_mes_qtd: int
    recebidos_mes_valor: Decimal
