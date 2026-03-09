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
  colorGroup?: PropertyColorGroup;
  instruction?: string;
  kind: TileKind;
  name: string;
  ownable: boolean;
};

export type StreetEstate = {
  buildingCost: number;
  hotelRent: number;
  houseRents: [number, number, number, number];
  mortgageValue: number;
  setRent: number;
};

export type PropertyColorGroup =
  | 'brown'
  | 'light_blue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'dark_blue';

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

export const PROPERTY_COLOR_GROUPS: Record<PropertyColorGroup, number[]> = {
  brown: [1, 3],
  light_blue: [6, 8, 9],
  pink: [11, 13, 14],
  orange: [16, 18, 19],
  red: [21, 23, 24],
  yellow: [26, 27, 29],
  green: [31, 32, 34],
  dark_blue: [37, 39]
};

export const STREET_ESTATES: Record<number, StreetEstate> = {
  1: { mortgageValue: 30, setRent: 4, houseRents: [10, 30, 90, 160], hotelRent: 250, buildingCost: 50 },
  3: { mortgageValue: 30, setRent: 8, houseRents: [20, 60, 180, 320], hotelRent: 450, buildingCost: 50 },
  6: { mortgageValue: 50, setRent: 12, houseRents: [30, 90, 270, 400], hotelRent: 550, buildingCost: 50 },
  8: { mortgageValue: 50, setRent: 12, houseRents: [30, 90, 270, 400], hotelRent: 550, buildingCost: 50 },
  9: { mortgageValue: 60, setRent: 16, houseRents: [40, 100, 300, 450], hotelRent: 600, buildingCost: 50 },
  11: { mortgageValue: 70, setRent: 20, houseRents: [50, 150, 450, 625], hotelRent: 750, buildingCost: 100 },
  13: { mortgageValue: 70, setRent: 20, houseRents: [50, 150, 450, 625], hotelRent: 750, buildingCost: 100 },
  14: { mortgageValue: 80, setRent: 24, houseRents: [60, 180, 500, 700], hotelRent: 900, buildingCost: 100 },
  16: { mortgageValue: 90, setRent: 28, houseRents: [70, 200, 550, 750], hotelRent: 950, buildingCost: 100 },
  18: { mortgageValue: 90, setRent: 28, houseRents: [70, 200, 550, 750], hotelRent: 950, buildingCost: 100 },
  19: { mortgageValue: 100, setRent: 32, houseRents: [80, 220, 600, 800], hotelRent: 1000, buildingCost: 100 },
  21: { mortgageValue: 110, setRent: 36, houseRents: [90, 250, 700, 875], hotelRent: 1050, buildingCost: 150 },
  23: { mortgageValue: 110, setRent: 36, houseRents: [90, 250, 700, 875], hotelRent: 1050, buildingCost: 150 },
  24: { mortgageValue: 120, setRent: 40, houseRents: [100, 300, 750, 925], hotelRent: 1100, buildingCost: 150 },
  26: { mortgageValue: 130, setRent: 44, houseRents: [110, 330, 800, 975], hotelRent: 1150, buildingCost: 150 },
  27: { mortgageValue: 130, setRent: 44, houseRents: [110, 330, 800, 975], hotelRent: 1150, buildingCost: 150 },
  29: { mortgageValue: 140, setRent: 48, houseRents: [120, 360, 850, 1025], hotelRent: 1200, buildingCost: 150 },
  31: { mortgageValue: 150, setRent: 52, houseRents: [130, 390, 900, 1100], hotelRent: 1275, buildingCost: 200 },
  32: { mortgageValue: 150, setRent: 52, houseRents: [130, 390, 900, 1100], hotelRent: 1275, buildingCost: 200 },
  34: { mortgageValue: 160, setRent: 56, houseRents: [150, 450, 1000, 1200], hotelRent: 1400, buildingCost: 200 },
  37: { mortgageValue: 175, setRent: 70, houseRents: [175, 500, 1100, 1300], hotelRent: 1500, buildingCost: 200 },
  39: { mortgageValue: 200, setRent: 100, houseRents: [200, 600, 1400, 1700], hotelRent: 2000, buildingCost: 200 }
};

export const BOARD_TILES: Record<number, TileDefinition> = {
  0: { kind: 'go', name: 'ВПЕРЕД', ownable: false },
  1: { kind: 'property', name: 'Тюмень', ownable: true, colorGroup: 'brown' },
  2: { kind: 'community_chest', name: 'Общественная казна', ownable: false },
  3: { kind: 'property', name: 'Самара', ownable: true, colorGroup: 'brown' },
  4: { kind: 'tax', name: 'Подоходный налог', ownable: false },
  5: { kind: 'railroad', name: 'Рижская железная дорога', ownable: true },
  6: { kind: 'property', name: 'Калуга', ownable: true, colorGroup: 'light_blue' },
  7: { kind: 'chance', name: 'Шанс', ownable: false },
  8: { kind: 'property', name: 'Пермь', ownable: true, colorGroup: 'light_blue' },
  9: { kind: 'property', name: 'Томск', ownable: true, colorGroup: 'light_blue' },
  10: { kind: 'jail', name: 'В тюрьме', ownable: false },
  11: { kind: 'property', name: 'Уфа', ownable: true, colorGroup: 'pink' },
  12: { kind: 'utility', name: 'Электростанция', ownable: true },
  13: { kind: 'property', name: 'Казань', ownable: true, colorGroup: 'pink' },
  14: { kind: 'property', name: 'Краснодар', ownable: true, colorGroup: 'pink' },
  15: { kind: 'railroad', name: 'Курская железная дорога', ownable: true },
  16: { kind: 'property', name: 'Архангельск', ownable: true, colorGroup: 'orange' },
  17: { kind: 'community_chest', name: 'Общественная казна', ownable: false },
  18: { kind: 'property', name: 'Челябинск', ownable: true, colorGroup: 'orange' },
  19: { kind: 'property', name: 'Нижний Новгород', ownable: true, colorGroup: 'orange' },
  20: { kind: 'free_parking', name: 'Бесплатная стоянка', ownable: false },
  21: { kind: 'property', name: 'Омск', ownable: true, colorGroup: 'red' },
  22: { kind: 'chance', name: 'Шанс', ownable: false },
  23: { kind: 'property', name: 'Вологда', ownable: true, colorGroup: 'red' },
  24: { kind: 'property', name: 'Белгород', ownable: true, colorGroup: 'red' },
  25: { kind: 'railroad', name: 'Казанская железная дорога', ownable: true },
  26: { kind: 'property', name: 'Ставрополь', ownable: true, colorGroup: 'yellow' },
  27: { kind: 'property', name: 'Ростов-на-Дону', ownable: true, colorGroup: 'yellow' },
  28: { kind: 'utility', name: 'Водопровод', ownable: true },
  29: { kind: 'property', name: 'Хабаровск', ownable: true, colorGroup: 'yellow' },
  30: { kind: 'go_to_jail', name: 'Отправляйтесь в тюрьму', ownable: false },
  31: { kind: 'property', name: 'Екатеринбург', ownable: true, colorGroup: 'green' },
  32: { kind: 'property', name: 'Владивосток', ownable: true, colorGroup: 'green' },
  33: { kind: 'community_chest', name: 'Общественная казна', ownable: false },
  34: { kind: 'property', name: 'Санкт-Петербург', ownable: true, colorGroup: 'green' },
  35: { kind: 'special_property', name: 'Ленинградская железная дорога', ownable: true },
  36: { kind: 'chance', name: 'Шанс', ownable: false },
  37: { kind: 'property', name: 'Москва', ownable: true, colorGroup: 'dark_blue' },
  38: { kind: 'tax', name: 'Сверхналог', ownable: false },
  39: { kind: 'property', name: 'Новосибирск', ownable: true, colorGroup: 'dark_blue' }
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

export function getTileColorGroup(tileIndex: number): PropertyColorGroup | null {
  return getTileDefinition(tileIndex).colorGroup ?? null;
}

export function getColorGroupTiles(colorGroup: PropertyColorGroup): number[] {
  return [...(PROPERTY_COLOR_GROUPS[colorGroup] ?? [])];
}

export function isUpgradableStreet(tileIndex: number): boolean {
  return Object.prototype.hasOwnProperty.call(STREET_ESTATES, ((tileIndex % 40) + 40) % 40);
}

export function getStreetEstate(tileIndex: number): StreetEstate {
  const normalizedTileIndex = ((tileIndex % 40) + 40) % 40;
  const estate = STREET_ESTATES[normalizedTileIndex];
  if (!estate) {
    throw new Error(`Unknown street estate for tile ${tileIndex}`);
  }
  return estate;
}

export function getStreetRent(tileIndex: number, level: number, hasFullColorSet: boolean): number {
  const estate = getStreetEstate(tileIndex);
  const normalizedLevel = Math.max(0, Math.min(5, Math.trunc(level)));
  if (normalizedLevel <= 0) {
    return hasFullColorSet ? estate.setRent : getTileBaseRent(tileIndex);
  }
  if (normalizedLevel >= 5) {
    return estate.hotelRent;
  }
  return estate.houseRents[normalizedLevel - 1];
}

export function getTileBaseRent(tileIndex: number): number {
  const normalizedTileIndex = ((tileIndex % 40) + 40) % 40;
  const baseRentByTile: Record<number, number> = {
    1: 2,
    3: 4,
    5: 25,
    6: 6,
    8: 6,
    9: 8,
    11: 10,
    12: 4,
    13: 10,
    14: 12,
    15: 25,
    16: 14,
    18: 14,
    19: 16,
    21: 18,
    23: 18,
    24: 20,
    25: 25,
    26: 22,
    27: 22,
    28: 4,
    29: 24,
    31: 26,
    32: 26,
    34: 28,
    35: 25,
    37: 35,
    39: 50
  };
  return baseRentByTile[normalizedTileIndex] ?? 0;
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
