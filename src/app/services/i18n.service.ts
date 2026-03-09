import { Injectable, computed, signal } from '@angular/core';

export type AppLanguage = 'ru' | 'en';

type TranslationKey =
  | 'app_title'
  | 'single_room'
  | 'login'
  | 'logout'
  | 'register'
  | 'create_account'
  | 'access_game'
  | 'join_game_fast'
  | 'username'
  | 'email'
  | 'password'
  | 'new_password'
  | 'reset_password'
  | 'forgot_password'
  | 'request_reset_link'
  | 'send_reset_email'
  | 'sending'
  | 'back_to_login'
  | 'simple_passwords_allowed'
  | 'account_created'
  | 'password_updated'
  | 'if_email_exists'
  | 'invalid_link'
  | 'set_new_password'
  | 'saving'
  | 'create_account_in_progress'
  | 'signing_in'
  | 'language_ru'
  | 'language_en'
  | 'your_turn'
  | 'other_users_turn'
  | 'waiting_for_players'
  | 'connection_connected'
  | 'connection_connecting'
  | 'connection_disconnected'
  | 'dice'
  | 'tile'
  | 'buy'
  | 'your_cards'
  | 'available_slot'
  | 'refresh_state'
  | 'connect'
  | 'new_game'
  | 'my_turn_is_first'
  | 'roll'
  | 'end_turn'
  | 'board_calibration'
  | 'drag_tile_hint'
  | 'finish_calibration'
  | 'reset_selected_tile'
  | 'reset_all_tiles'
  | 'log_geometry'
  | 'download_json_artifact'
  | 'left'
  | 'top'
  | 'width'
  | 'height'
  | 'artifact_target'
  | 'downloaded_file_name'
  | 'dice_section'
  | 'connection_section'
  | 'turn_section'
  | 'you_section'
  | 'players_section'
  | 'not_joined'
  | 'money'
  | 'price'
  | 'seat'
  | 'dev_mailhog'
  | 'login_failed'
  | 'register_failed'
  | 'password_reset_request_failed'
  | 'password_reset_failed'
  | 'owner_seat'
  | 'unowned'
  | 'index'
  | 'rent'
  | 'no_players_yet'
  | 'activity'
  | 'no_actions_yet'
  | 'connected_to_game_room'
  | 'login_first'
  | 'failed_to_load_game_state'
  | 'websocket_error'
  | 'websocket_closed'
  | 'required_field'
  | 'invalid_email_address'
  | 'cancel'
  | 'close'
  | 'applying'
  | 'take_action'
  | 'pay_tax'
  | 'watching_only'
  | 'request_timed_out'
  | 'invalid_credentials'
  | 'username_already_exists'
  | 'email_already_exists'
  | 'username_field'
  | 'email_field'
  | 'password_field'
  | 'cards_suffix'
  | 'joined_game_suffix'
  | 'moved_to_prefix'
  | 'received_prefix'
  | 'paid_prefix'
  | 'bought_prefix'
  | 'owns_suffix'
  | 'warning_title'
  | 'jail_actions'
  | 'attempt_jail_roll'
  | 'pay_jail_fine'
  | 'use_jail_free_card'
  | 'stored_possibilities'
  | 'get_out_of_jail_free'
  | 'get_out_of_jail_free_tooltip'
  | 'game_won_title'
  | 'game_won_message'
  | 'game_lost_title'
  | 'game_lost_message'
  | 'acknowledge'
  | 'need_connection_first'
  | 'wait_for_your_turn'
  | 'need_buyable_tile'
  | 'first_turn_already_locked'
  | 'you_are_in_jail'
  | 'choose_jail_action'
  | 'must_roll_again_after_double'
  | 'you_are_out_of_game'
  | 'game_finished'
  | 'not_in_jail'
  | 'no_jail_free_card'
  | 'color_sets'
  | 'no_color_sets_yet'
  | 'complete_set'
  | 'incomplete_set'
  | 'double_rent_note'
  | 'mortgage_cards'
  | 'no_mortgage_cards'
  | 'mortgaged'
  | 'level_label'
  | 'base_level'
  | 'hotel_level'
  | 'next_upgrade_cost'
  | 'building_cost'
  | 'mortgage_value'
  | 'unmortgage_cost'
  | 'confirm_unmortgage_title'
  | 'confirm_unmortgage_message'
  | 'confirm_unmortgage_apply';

const LANGUAGE_STORAGE_KEY = 'monopoly.language';

const TRANSLATIONS: Record<AppLanguage, Record<TranslationKey, string>> = {
  ru: {
    app_title: 'Монополия',
    single_room: '(одна комната)',
    login: 'Войти',
    logout: 'Выйти',
    register: 'Регистрация',
    create_account: 'Создать аккаунт',
    access_game: 'Вход в игру',
    join_game_fast: 'Присоединяйтесь к игре за несколько секунд',
    username: 'Имя пользователя',
    email: 'Email',
    password: 'Пароль',
    new_password: 'Новый пароль',
    reset_password: 'Сброс пароля',
    forgot_password: 'Забыли пароль?',
    request_reset_link: 'Запрос ссылки для сброса пароля',
    send_reset_email: 'Отправить письмо для сброса',
    sending: 'Отправка...',
    back_to_login: 'Назад ко входу',
    simple_passwords_allowed: 'Сейчас разрешены простые пароли, включая значения вроде 0000.',
    account_created: 'Аккаунт создан. Теперь вы можете войти.',
    password_updated: 'Пароль обновлён. Теперь вы можете войти.',
    if_email_exists: 'Если такой email существует, ссылка для сброса уже отправлена.',
    invalid_link: 'Неверная ссылка',
    set_new_password: 'Сохранить новый пароль',
    saving: 'Сохранение...',
    create_account_in_progress: 'Создание аккаунта...',
    signing_in: 'Вход...',
    language_ru: 'RU',
    language_en: 'EN',
    your_turn: 'ВАШ ХОД',
    other_users_turn: 'ХОД ДРУГОГО ИГРОКА',
    waiting_for_players: 'Ожидание игроков',
    connection_connected: 'Подключено',
    connection_connecting: 'Подключение…',
    connection_disconnected: 'Отключено',
    dice: 'Кости',
    tile: 'Поле',
    buy: 'Купить',
    your_cards: 'Ваши карточки',
    available_slot: 'Свободный слот',
    refresh_state: 'Обновить состояние',
    connect: 'Подключиться',
    new_game: 'Новая игра',
    my_turn_is_first: 'Мой ход первый',
    roll: 'Бросить',
    end_turn: 'Завершить ход',
    board_calibration: 'Калибровка поля',
    drag_tile_hint: 'Перетащите прямоугольник поля для перемещения или угол для изменения размера.',
    finish_calibration: 'Завершить калибровку',
    reset_selected_tile: 'Сбросить выбранное поле',
    reset_all_tiles: 'Сбросить все поля',
    log_geometry: 'Показать геометрию в логах',
    download_json_artifact: 'Скачать JSON артефакт',
    left: 'Слева',
    top: 'Сверху',
    width: 'Ширина',
    height: 'Высота',
    artifact_target: 'Целевой артефакт',
    downloaded_file_name: 'Имя скачанного файла',
    dice_section: 'Кости',
    connection_section: 'Подключение',
    turn_section: 'Ход',
    you_section: 'Вы',
    players_section: 'Игроки',
    not_joined: 'Не присоединились',
    money: 'Деньги',
    price: 'Цена',
    seat: 'Место',
    dev_mailhog: 'Dev: откройте MailHog на http://localhost:8025',
    login_failed: 'Не удалось войти.',
    register_failed: 'Не удалось зарегистрироваться.',
    password_reset_request_failed: 'Не удалось отправить запрос на сброс пароля.',
    password_reset_failed: 'Не удалось сбросить пароль.',
    owner_seat: 'Владелец',
    unowned: 'Без владельца',
    index: 'Индекс',
    rent: 'Рента',
    no_players_yet: 'Пока нет игроков',
    activity: 'Активность',
    no_actions_yet: 'Пока нет действий',
    connected_to_game_room: 'Подключено к игровой комнате',
    login_first: 'Сначала войдите',
    failed_to_load_game_state: 'Не удалось загрузить состояние игры',
    websocket_error: 'Ошибка WebSocket',
    websocket_closed: 'Соединение WebSocket закрыто',
    required_field: 'обязательное поле.',
    invalid_email_address: 'Введите корректный email адрес.',
    cancel: 'Отмена',
    close: 'Закрыть',
    applying: 'Применение...',
    take_action: 'Выполнить действие',
    pay_tax: 'Оплатить налог',
    watching_only: 'Только просмотр',
    request_timed_out: 'Сервер отвечает слишком долго. Попробуйте ещё раз.',
    invalid_credentials: 'Неверный логин или пароль.',
    username_already_exists: 'Пользователь с таким именем уже существует.',
    email_already_exists: 'Пользователь с таким email уже существует.',
    username_field: 'Имя пользователя',
    email_field: 'Email',
    password_field: 'Пароль',
    cards_suffix: 'карточки',
    joined_game_suffix: 'присоединился к игре',
    moved_to_prefix: 'переместился на',
    received_prefix: 'получил',
    paid_prefix: 'заплатил',
    bought_prefix: 'купил',
    owns_suffix: 'владеет',
    warning_title: 'Предупреждение',
    jail_actions: 'Действия в тюрьме',
    attempt_jail_roll: 'Пробовать дубль',
    pay_jail_fine: 'Заплатить 50',
    use_jail_free_card: 'Использовать выход из тюрьмы',
    stored_possibilities: 'Сохранённые возможности',
    get_out_of_jail_free: 'Выход из тюрьмы',
    get_out_of_jail_free_tooltip: 'Сохранённая карта: выйти из тюрьмы бесплатно. Можно применить, когда ваш игрок находится в тюрьме.',
    game_won_title: 'Вы победили',
    game_won_message: 'Вы остались последним не разорившимся игроком.',
    game_lost_title: 'Вы проиграли',
    game_lost_message: 'Ваш игрок выбыл из игры и больше не может выполнять ходы.',
    acknowledge: 'Понятно',
    need_connection_first: 'Сначала подключитесь к игровой комнате.',
    wait_for_your_turn: 'Сейчас не ваш ход.',
    need_buyable_tile: 'Сейчас нечего покупать.',
    first_turn_already_locked: 'Первый ход уже закреплён.',
    you_are_in_jail: 'Ваш игрок находится в тюрьме.',
    choose_jail_action: 'Сначала выберите действие для выхода из тюрьмы.',
    must_roll_again_after_double: 'У вас дубль — сначала выполните дополнительный бросок.',
    you_are_out_of_game: 'Ваш игрок уже выбыл из игры.',
    game_finished: 'Игра уже завершена.',
    not_in_jail: 'Ваш игрок сейчас не в тюрьме.',
    no_jail_free_card: 'У вас нет сохранённой карты выхода из тюрьмы.',
    color_sets: 'Цветовые наборы',
    no_color_sets_yet: 'Пока нет собранных цветовых наборов.',
    complete_set: 'Набор собран',
    incomplete_set: 'Набор не собран',
    double_rent_note: 'Базовая рента на улицах этого набора удваивается.',
    mortgage_cards: 'Заложенные и доступные для залога карточки',
    no_mortgage_cards: 'Сейчас нет подходящих карточек для залога.',
    mortgaged: 'Заложено',
    level_label: 'Уровень',
    base_level: 'База',
    hotel_level: 'Отель',
    next_upgrade_cost: 'Цена следующего улучшения',
    building_cost: 'Цена дома/отеля',
    mortgage_value: 'Сумма залога',
    unmortgage_cost: 'Цена выкупа',
    confirm_unmortgage_title: 'Выкупить эту собственность?',
    confirm_unmortgage_message: 'Подтвердите выкуп карточки по цене с надбавкой 10%.',
    confirm_unmortgage_apply: 'Выкупить',
  },
  en: {
    app_title: 'Monopoly',
    single_room: '(single room)',
    login: 'Login',
    logout: 'Logout',
    register: 'Register',
    create_account: 'Create account',
    access_game: 'Access the Monopoly table',
    join_game_fast: 'Join the game in a few seconds',
    username: 'Username',
    email: 'Email',
    password: 'Password',
    new_password: 'New password',
    reset_password: 'Reset password',
    forgot_password: 'Forgot password',
    request_reset_link: 'Request a password reset link',
    send_reset_email: 'Send reset email',
    sending: 'Sending...',
    back_to_login: 'Back to login',
    simple_passwords_allowed: 'Simple passwords are allowed in the current setup, including values like 0000.',
    account_created: 'Account created. You can login now.',
    password_updated: 'Password updated. You can login now.',
    if_email_exists: 'If this email exists, a reset link has been sent.',
    invalid_link: 'Invalid link',
    set_new_password: 'Set new password',
    saving: 'Saving...',
    create_account_in_progress: 'Creating account...',
    signing_in: 'Signing in...',
    language_ru: 'RU',
    language_en: 'EN',
    your_turn: 'YOUR TURN',
    other_users_turn: 'OTHER USER\'S TURN',
    waiting_for_players: 'Waiting for players',
    connection_connected: 'Connected',
    connection_connecting: 'Connecting…',
    connection_disconnected: 'Disconnected',
    dice: 'Dice',
    tile: 'Tile',
    buy: 'Buy',
    your_cards: 'Your cards',
    available_slot: 'Available slot',
    refresh_state: 'Refresh state',
    connect: 'Connect',
    new_game: 'New game',
    my_turn_is_first: 'My turn is first',
    roll: 'Roll',
    end_turn: 'End turn',
    board_calibration: 'Board calibration',
    drag_tile_hint: 'Drag a tile rectangle to move it, or drag a corner handle to resize it.',
    finish_calibration: 'Finish calibration',
    reset_selected_tile: 'Reset selected tile',
    reset_all_tiles: 'Reset all tiles',
    log_geometry: 'Log geometry',
    download_json_artifact: 'Download JSON artifact',
    left: 'Left',
    top: 'Top',
    width: 'Width',
    height: 'Height',
    artifact_target: 'Artifact target',
    downloaded_file_name: 'Downloaded file name',
    dice_section: 'Dice',
    connection_section: 'Connection',
    turn_section: 'Turn',
    you_section: 'You',
    players_section: 'Players',
    not_joined: 'Not joined',
    money: 'Money',
    price: 'Price',
    seat: 'Seat',
    dev_mailhog: 'Dev: open MailHog at http://localhost:8025',
    login_failed: 'Login failed.',
    register_failed: 'Registration failed.',
    password_reset_request_failed: 'Password reset request failed.',
    password_reset_failed: 'Password reset failed.',
    owner_seat: 'Owner seat',
    unowned: 'Unowned',
    index: 'Index',
    rent: 'Rent',
    no_players_yet: 'No players yet',
    activity: 'Activity',
    no_actions_yet: 'No actions yet',
    connected_to_game_room: 'Connected to game room',
    login_first: 'Login first',
    failed_to_load_game_state: 'Failed to load game state',
    websocket_error: 'WebSocket error',
    websocket_closed: 'WebSocket connection closed',
    required_field: 'is required.',
    invalid_email_address: 'Enter a valid email address.',
    cancel: 'Cancel',
    close: 'Close',
    applying: 'Applying...',
    take_action: 'Take an action',
    pay_tax: 'Pay tax',
    watching_only: 'Viewing only',
    request_timed_out: 'The server is taking too long to respond. Please try again.',
    invalid_credentials: 'Invalid username or password.',
    username_already_exists: 'A user with that username already exists.',
    email_already_exists: 'A user with that email already exists.',
    username_field: 'Username',
    email_field: 'Email',
    password_field: 'Password',
    cards_suffix: 'cards',
    joined_game_suffix: 'joined the game',
    moved_to_prefix: 'moved to',
    received_prefix: 'received',
    paid_prefix: 'paid',
    bought_prefix: 'bought',
    owns_suffix: 'owns',
    warning_title: 'Warning',
    jail_actions: 'Jail actions',
    attempt_jail_roll: 'Try for doubles',
    pay_jail_fine: 'Pay 50',
    use_jail_free_card: 'Use jail-free card',
    stored_possibilities: 'Stored possibilities',
    get_out_of_jail_free: 'Get out of jail',
    get_out_of_jail_free_tooltip: 'Stored card: get out of jail free. You can apply it when your player is in jail.',
    game_won_title: 'You won',
    game_won_message: 'You are the last player who did not go bankrupt.',
    game_lost_title: 'You lost',
    game_lost_message: 'Your player is out of the game and can no longer take turns.',
    acknowledge: 'OK',
    need_connection_first: 'Connect to the game room first.',
    wait_for_your_turn: 'It is not your turn right now.',
    need_buyable_tile: 'There is nothing to buy right now.',
    first_turn_already_locked: 'The first turn has already been locked in.',
    you_are_in_jail: 'Your player is in jail.',
    choose_jail_action: 'Choose a jail action first.',
    must_roll_again_after_double: 'You rolled doubles — take the extra roll first.',
    you_are_out_of_game: 'Your player is already out of the game.',
    game_finished: 'The game is already finished.',
    not_in_jail: 'Your player is not in jail right now.',
    no_jail_free_card: 'You do not have a stored get out of jail free card.',
    color_sets: 'Color sets',
    no_color_sets_yet: 'No completed color sets yet.',
    complete_set: 'Set complete',
    incomplete_set: 'Set incomplete',
    double_rent_note: 'Base rent on streets in this set is doubled.',
    mortgage_cards: 'Mortgaged and mortgage-ready cards',
    no_mortgage_cards: 'There are no mortgage-eligible cards right now.',
    mortgaged: 'Mortgaged',
    level_label: 'Level',
    base_level: 'Base',
    hotel_level: 'Hotel',
    next_upgrade_cost: 'Next upgrade cost',
    building_cost: 'House/hotel cost',
    mortgage_value: 'Mortgage value',
    unmortgage_cost: 'Unmortgage cost',
    confirm_unmortgage_title: 'Unmortgage this property?',
    confirm_unmortgage_message: 'Confirm buying this card back with the 10% premium applied.',
    confirm_unmortgage_apply: 'Unmortgage',
  },
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly language = signal<AppLanguage>(this.loadLanguage());
  readonly isRussian = computed(() => this.language() === 'ru');

  setLanguage(language: AppLanguage): void {
    this.language.set(language);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }

  toggleLanguage(): void {
    this.setLanguage(this.language() === 'ru' ? 'en' : 'ru');
  }

  t(key: TranslationKey): string {
    return TRANSLATIONS[this.language()][key];
  }

  private loadLanguage(): AppLanguage {
    const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return storedLanguage === 'en' || storedLanguage === 'ru' ? storedLanguage : 'ru';
  }
}
