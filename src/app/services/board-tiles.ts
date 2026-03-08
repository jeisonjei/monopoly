export type TileKind =
  | 'go'
  | 'property'
  | 'railroad'
  | 'utility'
  | 'special_property'
  | 'community_chest'
  | 'chance'
  | 'tax'
  | 'jail'
  | 'free_parking'
  | 'go_to_jail';

export type BoardEventKind = 'community_chest' | 'chance' | 'tax';

export type TileDefinition = {
  cardTitle?: string;
  instruction?: string;
  kind: TileKind;
  name: string;
  ownable: boolean;
};

export type SpecialCardActionKind =
  | 'move_relative'
  | 'move_absolute'
  | 'money_delta'
  | 'money_from_each_player'
  | 'money_to_each_player'
  | 'move_to_next_utility'
  | 'move_to_next_railroad'
  | 'jail_free'
  | 'repair_cost'
  | 'go_to_jail';

export type SpecialCardPayload = {
  action: {
    kind: SpecialCardActionKind;
    target_tile_index?: number;
    value?: number | null;
  };
  actionButtonLabel?: string;
  cardId?: string;
  cardKind: BoardEventKind;
  instruction: string;
  tileIndex: number;
  title: string;
};

export const BOARD_TILES: Record<number, TileDefinition> = {
  0: { kind: 'go', name: 'ВПЕРЕД', ownable: false },
  1: { kind: 'property', name: 'Тюмень', ownable: true },
  2: { kind: 'community_chest', name: 'Общественная казна', ownable: false },
  3: { kind: 'property', name: 'Самара', ownable: true },
  4: { kind: 'tax', name: 'Подоходный налог', ownable: false },
  5: { kind: 'railroad', name: 'Рижская железная дорога', ownable: true },
  6: { kind: 'property', name: 'Калуга', ownable: true },
  7: { kind: 'chance', name: 'Шанс', ownable: false },
  8: { kind: 'property', name: 'Пермь', ownable: true },
  9: { kind: 'property', name: 'Томск', ownable: true },
  10: { kind: 'jail', name: 'В тюрьме', ownable: false },
  11: { kind: 'property', name: 'Уфа', ownable: true },
  12: { kind: 'utility', name: 'Электростанция', ownable: true },
  13: { kind: 'property', name: 'Казань', ownable: true },
  14: { kind: 'property', name: 'Краснодар', ownable: true },
  15: { kind: 'railroad', name: 'Курская железная дорога', ownable: true },
  16: { kind: 'property', name: 'Архангельск', ownable: true },
  17: { kind: 'community_chest', name: 'Общественная казна', ownable: false },
  18: { kind: 'property', name: 'Челябинск', ownable: true },
  19: { kind: 'property', name: 'Нижний Новгород', ownable: true },
  20: { kind: 'free_parking', name: 'Бесплатная стоянка', ownable: false },
  21: { kind: 'property', name: 'Омск', ownable: true },
  22: { kind: 'chance', name: 'Шанс', ownable: false },
  23: { kind: 'property', name: 'Вологда', ownable: true },
  24: { kind: 'property', name: 'Белгород', ownable: true },
  25: { kind: 'railroad', name: 'Казанская железная дорога', ownable: true },
  26: { kind: 'property', name: 'Ставрополь', ownable: true },
  27: { kind: 'property', name: 'Ростов-на-Дону', ownable: true },
  28: { kind: 'utility', name: 'Водопровод', ownable: true },
  29: { kind: 'property', name: 'Хабаровск', ownable: true },
  30: { kind: 'go_to_jail', name: 'Отправляйтесь в тюрьму', ownable: false },
  31: { kind: 'property', name: 'Екатеринбург', ownable: true },
  32: { kind: 'property', name: 'Владивосток', ownable: true },
  33: { kind: 'community_chest', name: 'Общественная казна', ownable: false },
  34: { kind: 'property', name: 'Санкт-Петербург', ownable: true },
  35: { kind: 'special_property', name: 'Ленинградская железная дорога', ownable: true },
  36: { kind: 'chance', name: 'Шанс', ownable: false },
  37: { kind: 'property', name: 'Москва', ownable: true },
  38: { kind: 'tax', name: 'Сверхналог', ownable: false },
  39: { kind: 'property', name: 'Новосибирск', ownable: true }
};

export function getTileDefinition(tileIndex: number): TileDefinition {
  return BOARD_TILES[((tileIndex % 40) + 40) % 40] ?? {
    kind: 'property',
    name: `Tile ${tileIndex}`,
    ownable: false
  };
}

export function isOwnableTile(tileIndex: number): boolean {
  return getTileDefinition(tileIndex).ownable;
}

export function cardSortRank(kind: TileKind): number {
  if (kind === 'property') {
    return 0;
  }

  if (kind === 'railroad' || kind === 'utility' || kind === 'special_property') {
    return 1;
  }

  return 2;
}

export function tileKindLabel(kind: TileKind): string | null {
  if (kind === 'railroad') return 'Железная дорога';
  if (kind === 'utility') return 'Служба';
  if (kind === 'special_property') return 'Особый актив';
  return null;
}

export function boardEventKicker(kind: BoardEventKind): string {
  if (kind === 'chance') return 'Шанс';
  if (kind === 'community_chest') return 'Общественная казна';
  return 'Налог';
}

export function boardEventActionLabel(card: SpecialCardPayload): string {
  if (card.action.kind === 'money_delta') {
    const value = card.action.value ?? 0;
    return value >= 0
      ? `Действие: получите $${value} из банка`
      : `Действие: заплатите $${Math.abs(value)} в банк`;
  }

  if (card.action.kind === 'move_relative') {
    const value = card.action.value ?? 0;
    return value >= 0 ? `Действие: переместитесь на ${value} клетки вперед` : `Действие: переместитесь на ${Math.abs(value)} клетки назад`;
  }

   if (card.action.kind === 'move_absolute') {
    return 'Действие: переместитесь на указанное поле и выполните его эффект';
  }

  if (card.action.kind === 'money_from_each_player') {
    const value = card.action.value ?? 0;
    return `Действие: получите по $${value} от каждого другого игрока`;
  }

  if (card.action.kind === 'money_to_each_player') {
    const value = card.action.value ?? 0;
    return `Действие: заплатите по $${value} каждому другому игроку`;
  }

  if (card.action.kind === 'move_to_next_utility') {
    return 'Действие: перейдите к следующему коммунальному предприятию и примените особые правила карты';
  }

  if (card.action.kind === 'move_to_next_railroad') {
    return 'Действие: перейдите к следующей железной дороге и примените особые правила карты';
  }

  if (card.action.kind === 'jail_free') {
    return 'Действие: получите карточку выхода из тюрьмы';
  }

  if (card.action.kind === 'repair_cost') {
    return 'Действие: в текущей версии стоимость ремонта равна $0';
  }

  return 'Действие: отправляйтесь прямо в тюрьму';
}

export function boardEventActionButtonLabel(card: SpecialCardPayload): string {
  return card.actionButtonLabel ?? '';
}
