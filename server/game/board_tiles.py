import random
from typing import NotRequired, TypedDict


class TileDefinition(TypedDict):
    kind: str
    name: str
    ownable: bool


class CardAction(TypedDict):
    kind: str
    value: NotRequired[int | None]
    target_tile_index: NotRequired[int]


class CardDefinition(TypedDict):
    id: str
    action: CardAction
    actionButtonLabel: str
    cardKind: str
    instruction: str
    title: str


class PropertyEconomics(TypedDict):
    purchase_price: int
    base_rent: int


BOARD_TILES: dict[int, TileDefinition] = {
    0: {"kind": "go", "name": "ВПЕРЕД", "ownable": False},
    1: {"kind": "property", "name": "Тюмень", "ownable": True},
    2: {"kind": "community_chest", "name": "Общественная казна", "ownable": False},
    3: {"kind": "property", "name": "Самара", "ownable": True},
    4: {"kind": "tax", "name": "Подоходный налог", "ownable": False},
    5: {"kind": "railroad", "name": "Рижская железная дорога", "ownable": True},
    6: {"kind": "property", "name": "Калуга", "ownable": True},
    7: {"kind": "chance", "name": "Шанс", "ownable": False},
    8: {"kind": "property", "name": "Пермь", "ownable": True},
    9: {"kind": "property", "name": "Томск", "ownable": True},
    10: {"kind": "jail", "name": "В тюрьме", "ownable": False},
    11: {"kind": "property", "name": "Уфа", "ownable": True},
    12: {"kind": "utility", "name": "Электростанция", "ownable": True},
    13: {"kind": "property", "name": "Казань", "ownable": True},
    14: {"kind": "property", "name": "Краснодар", "ownable": True},
    15: {"kind": "railroad", "name": "Курская железная дорога", "ownable": True},
    16: {"kind": "property", "name": "Архангельск", "ownable": True},
    17: {"kind": "community_chest", "name": "Общественная казна", "ownable": False},
    18: {"kind": "property", "name": "Челябинск", "ownable": True},
    19: {"kind": "property", "name": "Нижний Новгород", "ownable": True},
    20: {"kind": "free_parking", "name": "Бесплатная стоянка", "ownable": False},
    21: {"kind": "property", "name": "Омск", "ownable": True},
    22: {"kind": "chance", "name": "Шанс", "ownable": False},
    23: {"kind": "property", "name": "Вологда", "ownable": True},
    24: {"kind": "property", "name": "Белгород", "ownable": True},
    25: {"kind": "railroad", "name": "Казанская железная дорога", "ownable": True},
    26: {"kind": "property", "name": "Ставрополь", "ownable": True},
    27: {"kind": "property", "name": "Ростов-на-Дону", "ownable": True},
    28: {"kind": "utility", "name": "Водопровод", "ownable": True},
    29: {"kind": "property", "name": "Хабаровск", "ownable": True},
    30: {"kind": "go_to_jail", "name": "Отправляйтесь в тюрьму", "ownable": False},
    31: {"kind": "property", "name": "Екатеринбург", "ownable": True},
    32: {"kind": "property", "name": "Владивосток", "ownable": True},
    33: {"kind": "community_chest", "name": "Общественная казна", "ownable": False},
    34: {"kind": "property", "name": "Санкт-Петербург", "ownable": True},
    35: {"kind": "special_property", "name": "Ангарская нефтехимическая компания", "ownable": True},
    36: {"kind": "chance", "name": "Шанс", "ownable": False},
    37: {"kind": "property", "name": "Москва", "ownable": True},
    38: {"kind": "tax", "name": "Сверхналог", "ownable": False},
    39: {"kind": "property", "name": "Новосибирск", "ownable": True},
}

PROPERTY_ECONOMICS: dict[int, PropertyEconomics] = {
    1: {"purchase_price": 60, "base_rent": 2},
    3: {"purchase_price": 60, "base_rent": 4},
    5: {"purchase_price": 200, "base_rent": 25},
    6: {"purchase_price": 100, "base_rent": 6},
    8: {"purchase_price": 100, "base_rent": 6},
    9: {"purchase_price": 120, "base_rent": 8},
    11: {"purchase_price": 140, "base_rent": 10},
    12: {"purchase_price": 150, "base_rent": 4},
    13: {"purchase_price": 140, "base_rent": 10},
    14: {"purchase_price": 160, "base_rent": 12},
    15: {"purchase_price": 200, "base_rent": 25},
    16: {"purchase_price": 180, "base_rent": 14},
    18: {"purchase_price": 180, "base_rent": 14},
    19: {"purchase_price": 200, "base_rent": 16},
    21: {"purchase_price": 220, "base_rent": 18},
    23: {"purchase_price": 220, "base_rent": 18},
    24: {"purchase_price": 240, "base_rent": 20},
    25: {"purchase_price": 200, "base_rent": 25},
    26: {"purchase_price": 260, "base_rent": 22},
    27: {"purchase_price": 260, "base_rent": 22},
    28: {"purchase_price": 150, "base_rent": 4},
    29: {"purchase_price": 280, "base_rent": 24},
    31: {"purchase_price": 300, "base_rent": 26},
    32: {"purchase_price": 300, "base_rent": 26},
    34: {"purchase_price": 320, "base_rent": 28},
    35: {"purchase_price": 200, "base_rent": 25},
    37: {"purchase_price": 350, "base_rent": 35},
    39: {"purchase_price": 400, "base_rent": 50},
}

COMMUNITY_CHEST_CARDS: list[CardDefinition] = [
    {"id": "community_chest_01", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Плата за консультацию. Получи М25.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": 25}},
    {"id": "community_chest_02", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Иди на поле «Вперед». Получи М200.", "actionButtonLabel": "Take an action", "action": {"kind": "move_absolute", "target_tile_index": 0}},
    {"id": "community_chest_03", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Ошибка банка в твою пользу. Получи М200.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": 200}},
    {"id": "community_chest_04", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "У тебя день рождения. Получи М10 от каждого игрока.", "actionButtonLabel": "Take an action", "action": {"kind": "money_from_each_player", "value": 10}},
    {"id": "community_chest_05", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Ты получаешь наследство М100.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": 100}},
    {"id": "community_chest_06", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Расходы на лечение. Заплати М100.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": -100}},
    {"id": "community_chest_07", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Школьные сборы. Заплати М50.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": -50}},
    {"id": "community_chest_08", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Ты занял второе место на конкурсе красоты. Получи М10.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": 10}},
    {"id": "community_chest_09", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Тебе выдали отпускные. Получи М100.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": 100}},
    {"id": "community_chest_10", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Отправляйся прямо в тюрьму. Не проходи на поле «Вперед». Не получай М200.", "actionButtonLabel": "Take an action", "action": {"kind": "go_to_jail"}},
    {"id": "community_chest_11", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Ты продаешь акции и получаешь М50.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": 50}},
    {"id": "community_chest_12", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Истекает полис страхования жизни. Получи М100.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": 100}},
    {"id": "community_chest_13", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Возмещение подоходного налога. Получи М20.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": 20}},
    {"id": "community_chest_14", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "ВЫЙТИ ИЗ ТЮРЬМЫ БЕСПЛАТНО. Карточку можно оставить, чтобы использовать в будущем или обменять.", "actionButtonLabel": "Take an action", "action": {"kind": "jail_free"}},
    {"id": "community_chest_15", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Заплати налог на ремонт улиц. Заплати М40 за каждый свой дом и М115 за каждый свой отель.", "actionButtonLabel": "Take an action", "action": {"kind": "repair_cost", "value": 0}},
    {"id": "community_chest_16", "cardKind": "community_chest", "title": "Общественная казна", "instruction": "Прием врача. Заплати М50.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": -50}},
]

CHANCE_CARDS: list[CardDefinition] = [
    {"id": "chance_01", "cardKind": "chance", "title": "Шанс", "instruction": "Отправляйся в Уфу. Если пройдешь поле «Вперед», получи М200.", "actionButtonLabel": "Take an action", "action": {"kind": "move_absolute", "target_tile_index": 11}},
    {"id": "chance_02", "cardKind": "chance", "title": "Шанс", "instruction": "Отправляйся в Белгород. Если пройдешь поле «Вперед», получи М200.", "actionButtonLabel": "Take an action", "action": {"kind": "move_absolute", "target_tile_index": 24}},
    {"id": "chance_03", "cardKind": "chance", "title": "Шанс", "instruction": "Вернись на три поля назад.", "actionButtonLabel": "Take an action", "action": {"kind": "move_relative", "value": -3}},
    {"id": "chance_04", "cardKind": "chance", "title": "Шанс", "instruction": "Истекает срок займа на строительство. Получи М150.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": 150}},
    {"id": "chance_05", "cardKind": "chance", "title": "Шанс", "instruction": "Штраф за превышение скорости М15.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": -15}},
    {"id": "chance_06", "cardKind": "chance", "title": "Шанс", "instruction": "Иди к следующему коммунальному предприятию. Если оно СВОБОДНО, можешь купить его у банка. Если оно ЗАНЯТО, брось кубики и заплати владельцу 10 х число на кубиках.", "actionButtonLabel": "Take an action", "action": {"kind": "move_to_next_utility"}},
    {"id": "chance_07", "cardKind": "chance", "title": "Шанс", "instruction": "ВЫЙТИ ИЗ ТЮРЬМЫ БЕСПЛАТНО. Карточку можно оставить, чтобы использовать в будущем или обменять.", "actionButtonLabel": "Take an action", "action": {"kind": "jail_free"}},
    {"id": "chance_08", "cardKind": "chance", "title": "Шанс", "instruction": "Соверши поездку по железной дороге. Если проедешь поле «Вперед», получи М200.", "actionButtonLabel": "Take an action", "action": {"kind": "move_absolute", "target_tile_index": 5}},
    {"id": "chance_09", "cardKind": "chance", "title": "Шанс", "instruction": "Тебя выбрали председателем совета директоров. Заплати всем игрокам по М50.", "actionButtonLabel": "Take an action", "action": {"kind": "money_to_each_player", "value": 50}},
    {"id": "chance_10", "cardKind": "chance", "title": "Шанс", "instruction": "Отправляйся прямо в тюрьму. Не проходи на поле «Вперед». Не получай М200.", "actionButtonLabel": "Take an action", "action": {"kind": "go_to_jail"}},
    {"id": "chance_11", "cardKind": "chance", "title": "Шанс", "instruction": "Иди к следующей железной дороге. Если она СВОБОДНА, можешь купить ее у Банка. Если она ЗАНЯТА, заплати владельцу двойную ренту.", "actionButtonLabel": "Take an action", "action": {"kind": "move_to_next_railroad"}},
    {"id": "chance_12", "cardKind": "chance", "title": "Шанс", "instruction": "Иди на поле «Вперед». Получи М200.", "actionButtonLabel": "Take an action", "action": {"kind": "move_absolute", "target_tile_index": 0}},
    {"id": "chance_13", "cardKind": "chance", "title": "Шанс", "instruction": "Иди к следующей железной дороге. Если она СВОБОДНА, можешь купить ее у Банка. Если она ЗАНЯТА, заплати владельцу двойную ренту.", "actionButtonLabel": "Take an action", "action": {"kind": "move_to_next_railroad"}},
    {"id": "chance_14", "cardKind": "chance", "title": "Шанс", "instruction": "Банк платит тебе дивиденды М50.", "actionButtonLabel": "Take an action", "action": {"kind": "money_delta", "value": 50}},
    {"id": "chance_15", "cardKind": "chance", "title": "Шанс", "instruction": "Проведи общий ремонт всех своих зданий: за каждый дом заплати М25, за каждый день отель заплати М100.", "actionButtonLabel": "Take an action", "action": {"kind": "repair_cost", "value": 0}},
    {"id": "chance_16", "cardKind": "chance", "title": "Шанс", "instruction": "Отправляйся в Новосибирск.", "actionButtonLabel": "Take an action", "action": {"kind": "move_absolute", "target_tile_index": 39}},
]

CARD_DEFINITIONS: dict[str, list[CardDefinition]] = {
    "community_chest": COMMUNITY_CHEST_CARDS,
    "chance": CHANCE_CARDS,
}

CARD_LOOKUP: dict[str, CardDefinition] = {
    card["id"]: card
    for cards in CARD_DEFINITIONS.values()
    for card in cards
}


def get_tile_definition(tile_index: int) -> TileDefinition:
    normalized_tile_index = tile_index % 40
    return BOARD_TILES.get(normalized_tile_index, {"kind": "property", "name": f"Tile {tile_index}", "ownable": False})


def is_ownable_tile(tile_index: int) -> bool:
    return bool(get_tile_definition(tile_index)["ownable"])


def get_property_economics(tile_index: int) -> PropertyEconomics:
    normalized_tile_index = tile_index % 40
    economics = PROPERTY_ECONOMICS.get(normalized_tile_index)
    if economics is None:
        raise KeyError(f"Unknown property economics for tile {tile_index}")
    return economics


def get_card_definition(card_kind: str, card_id: str) -> CardDefinition:
    card = CARD_LOOKUP.get(card_id)
    if card is None or card["cardKind"] != card_kind:
        raise KeyError(f"Unknown {card_kind} card: {card_id}")
    return card


def create_shuffled_deck(card_kind: str) -> list[str]:
    cards = CARD_DEFINITIONS.get(card_kind, [])
    card_ids = [card["id"] for card in cards]
    random.shuffle(card_ids)
    return card_ids


def create_special_card_payload(tile_index: int, card_id: str | None = None) -> dict:
    tile = get_tile_definition(tile_index)
    kind = tile["kind"]

    if kind == "tax":
        return {
            "type": "special_card_drawn",
            "actionButtonLabel": "Pay tax",
            "cardKind": "tax",
            "tileIndex": tile_index,
            "title": tile["name"],
            "instruction": "Заплатите $200 в банк.",
            "action": {"kind": "money_delta", "value": -200},
        }

    resolved_card_kind = kind if kind in CARD_DEFINITIONS else "chance"
    resolved_card_id = card_id or CARD_DEFINITIONS[resolved_card_kind][0]["id"]
    card = get_card_definition(resolved_card_kind, resolved_card_id)
    return {
        "type": "special_card_drawn",
        "cardId": card["id"],
        "actionButtonLabel": card["actionButtonLabel"],
        "cardKind": card["cardKind"],
        "tileIndex": tile_index,
        "title": card["title"],
        "instruction": card["instruction"],
        "action": card["action"],
    }
