/**
 * mesh-settings-data.js — Meshtastic settings registry, mirrors the
 * fields exposed by `python -m meshtastic --set / --get` (i.e. the
 * `Config` and `ModuleConfig` protobuf messages).
 *
 * Each field has:
 *   key:     dot path matching the Python CLI's `--set <path>` syntax
 *   label:   human-readable label (zh-TW)
 *   type:    'bool' | 'enum' | 'int' | 'float' | 'string'
 *   value:   current/mock value
 *   options: enum value list (only for type 'enum')
 *   unit:    optional display suffix
 *
 * Values are mock until IPC plumbing lands. The structure is canonical:
 * the same keys are valid for `python -m meshtastic --set <key> <val>`.
 */

// Helpers ---------------------------------------------------------------
function f(key, label, type, value, extra = {}) {
  return { key, label, type, value, ...extra };
}

// ── Top-level config groups ──────────────────────────────────────────
export const CONFIG_GROUPS = {
  device: {
    title: '裝置',
    cli:   'device',
    fields: [
      f('device.role',                       '角色',                  'enum', 'CLIENT', {
        options: ['CLIENT','CLIENT_MUTE','ROUTER','ROUTER_CLIENT','REPEATER','TRACKER','SENSOR','TAK','CLIENT_HIDDEN','LOST_AND_FOUND','TAK_TRACKER'] }),
      f('device.serial_enabled',             'Serial 啟用',           'bool', true),
      f('device.debug_log_enabled',          'Debug log',             'bool', false),
      f('device.button_gpio',                'Button GPIO',           'int',  0),
      f('device.buzzer_gpio',                'Buzzer GPIO',           'int',  0),
      f('device.rebroadcast_mode',           'Rebroadcast 模式',      'enum', 'ALL', {
        options: ['ALL','ALL_SKIP_DECODING','LOCAL_ONLY','KNOWN_ONLY','NONE','CORE_PORTNUMS_ONLY'] }),
      f('device.node_info_broadcast_secs',   'Node info 週期', 'int',  10800, { unit: 's' }),
      f('device.double_tap_as_button_press', '雙擊作為按鍵',    'bool', false),
      f('device.is_managed',                 'Managed 模式',          'bool', false),
      f('device.disable_triple_click',       '停用三擊',              'bool', false),
      f('device.tzdef',                      '時區 (POSIX)',          'string', 'CST-8'),
      f('device.led_heartbeat_disabled',     '停用 LED 心跳',          'bool', false),
    ],
  },

  lora: {
    title: 'LoRa',
    cli:   'lora',
    fields: [
      f('lora.region',                'Region',           'enum', 'TW', {
        options: ['UNSET','US','EU_433','EU_868','CN','JP','ANZ','KR','TW','RU','IN','NZ_865','TH','LORA_24','UA_433','UA_868','MY_433','MY_919','SG_923','PH_433','PH_868','PH_915','ANZ_433'] }),
      f('lora.use_preset',            '使用預設',         'bool', true),
      f('lora.modem_preset',          'Modem Preset',     'enum', 'LONG_FAST', {
        options: ['LONG_FAST','LONG_SLOW','VERY_LONG_SLOW','MEDIUM_SLOW','MEDIUM_FAST','SHORT_SLOW','SHORT_FAST','LONG_MODERATE','SHORT_TURBO'] }),
      f('lora.bandwidth',             'Bandwidth',        'int',   250,  { unit: 'kHz' }),
      f('lora.spread_factor',         'Spread Factor',    'int',   11),
      f('lora.coding_rate',           'Coding Rate',      'int',   5),
      f('lora.frequency_offset',      'Freq Offset',      'float', 0.0,  { unit: 'MHz' }),
      f('lora.hop_limit',             'Hop Limit',        'int',   3),
      f('lora.tx_enabled',            'TX 啟用',           'bool',  true),
      f('lora.tx_power',              'TX Power',         'int',   22,   { unit: 'dBm' }),
      f('lora.channel_num',           '主頻道號',         'int',   0),
      f('lora.override_duty_cycle',   'Override Duty',    'bool',  false),
      f('lora.sx126x_rx_boosted_gain','RX 增強',           'bool',  true),
      f('lora.override_frequency',    'Override Freq',    'float', 0.0,  { unit: 'MHz' }),
      f('lora.pa_fan_disabled',       'PA 風扇停用',      'bool',  false),
      f('lora.ignore_incoming',       'Ignore Incoming',  'string',''),
      f('lora.ignore_mqtt',           'Ignore MQTT',      'bool',  false),
      f('lora.config_ok_to_mqtt',     'Config OK→MQTT',   'bool',  false),
    ],
  },

  position: {
    title: '位置',
    cli:   'position',
    fields: [
      f('position.position_broadcast_secs',           '廣播週期',          'int',   900,  { unit: 's' }),
      f('position.position_broadcast_smart_enabled',  'Smart broadcast',   'bool',  true),
      f('position.fixed_position',                    '固定位置',           'bool',  false),
      f('position.gps_update_interval',               'GPS 更新週期',      'int',   30,   { unit: 's' }),
      f('position.position_flags',                    'Position flags',    'int',   0xFFF, { unit: '(bitmask)' }),
      f('position.rx_gpio',                           'RX GPIO',           'int',   0),
      f('position.tx_gpio',                           'TX GPIO',           'int',   0),
      f('position.broadcast_smart_minimum_distance',  'Smart 最小距離',    'int',   100,  { unit: 'm' }),
      f('position.broadcast_smart_minimum_interval_secs', 'Smart 最小間隔', 'int',  30,   { unit: 's' }),
      f('position.gps_en_gpio',                       'GPS Enable GPIO',   'int',   0),
      f('position.gps_mode',                          'GPS 模式',          'enum',  'ENABLED', {
        options: ['DISABLED','ENABLED','NOT_PRESENT'] }),
    ],
  },

  power: {
    title: '電源',
    cli:   'power',
    fields: [
      f('power.is_power_saving',              '省電模式',         'bool',  false),
      f('power.on_battery_shutdown_after_secs','電池關機延遲',    'int',   0,    { unit: 's' }),
      f('power.adc_multiplier_override',      'ADC 倍率',          'float', 0.0),
      f('power.wait_bluetooth_secs',          'BT 等待',          'int',   60,   { unit: 's' }),
      f('power.sds_secs',                     'SDS 秒數',          'int',   0,    { unit: 's' }),
      f('power.ls_secs',                      'Light sleep',      'int',   300,  { unit: 's' }),
      f('power.min_wake_secs',                '最短喚醒',          'int',   10,   { unit: 's' }),
      f('power.device_battery_ina_address',   'INA 位址',          'int',   0),
      f('power.powermon_enables',             'Powermon enables', 'int',   0,    { unit: '(bitmask)' }),
    ],
  },

  network: {
    title: '網路',
    cli:   'network',
    fields: [
      f('network.wifi_enabled',     'WiFi 啟用',         'bool',  false),
      f('network.wifi_ssid',        'WiFi SSID',        'string', ''),
      f('network.wifi_psk',         'WiFi 密碼',         'string', ''),
      f('network.ntp_server',       'NTP Server',       'string', '0.pool.ntp.org'),
      f('network.eth_enabled',      'Ethernet 啟用',    'bool',  false),
      f('network.address_mode',     'IP 模式',           'enum',  'DHCP', { options: ['DHCP','STATIC'] }),
      f('network.ipv4_config.ip',         '靜態 IP',         'string', '0.0.0.0'),
      f('network.ipv4_config.gateway',    '閘道',             'string', '0.0.0.0'),
      f('network.ipv4_config.subnet',     '子網路遮罩',       'string', '0.0.0.0'),
      f('network.ipv4_config.dns',        'DNS',             'string', '0.0.0.0'),
      f('network.rsyslog_server',         'rsyslog Server',   'string', ''),
      f('network.enabled_protocols',      'Enabled protocols','int',   0,    { unit: '(UDP|TCP)' }),
    ],
  },

  display: {
    title: '顯示',
    cli:   'display',
    fields: [
      f('display.screen_on_secs',           '螢幕亮屏',           'int',   60,   { unit: 's' }),
      f('display.gps_format',               'GPS 格式',           'enum',  'DEC', {
        options: ['DEC','DMS','UTM','MGRS','OLC','OSGR'] }),
      f('display.auto_screen_carousel_secs','自動翻頁',           'int',   0,    { unit: 's' }),
      f('display.compass_north_top',         '北朝上',              'bool',  true),
      f('display.flip_screen',               '螢幕翻轉',           'bool',  false),
      f('display.units',                    '單位',                'enum',  'METRIC', { options: ['METRIC','IMPERIAL'] }),
      f('display.oled',                     'OLED 變體',           'enum',  'OLED_AUTO', {
        options: ['OLED_AUTO','OLED_SSD1306','OLED_SH1106','OLED_SH1107'] }),
      f('display.displaymode',              'Display 模式',        'enum',  'DEFAULT', {
        options: ['DEFAULT','TWOCOLOR','INVERTED','COLOR'] }),
      f('display.heading_bold',             'Heading 粗體',         'bool',  true),
      f('display.wake_on_tap_or_motion',    '輕拍/搖晃喚醒',         'bool',  false),
      f('display.compass_orientation',      '羅盤方向',             'enum',  'DEGREES_0', {
        options: ['DEGREES_0','DEGREES_90','DEGREES_180','DEGREES_270','DEGREES_0_INVERTED','DEGREES_90_INVERTED','DEGREES_180_INVERTED','DEGREES_270_INVERTED'] }),
    ],
  },

  bluetooth: {
    title: '藍牙',
    cli:   'bluetooth',
    fields: [
      f('bluetooth.enabled',   'BT 啟用',     'bool', true),
      f('bluetooth.mode',      '配對模式',    'enum', 'RANDOM_PIN', { options: ['RANDOM_PIN','FIXED_PIN','NO_PIN'] }),
      f('bluetooth.fixed_pin', '固定 PIN',    'int',  123456),
    ],
  },

  security: {
    title: '安全',
    cli:   'security',
    fields: [
      f('security.public_key',                '公鑰',           'string', '(32B)'),
      f('security.private_key',               '私鑰',           'string', '••••••••'),
      f('security.admin_key',                 'Admin key',     'string', '(32B)'),
      f('security.is_managed',                'Managed',       'bool',   false),
      f('security.serial_enabled',            'Serial admin',  'bool',   true),
      f('security.debug_log_api_enabled',     'Debug log API', 'bool',   false),
      f('security.bluetooth_logging_enabled', 'BT logging',    'bool',   false),
      f('security.admin_channel_enabled',     'Admin channel', 'bool',   false),
    ],
  },

  user: {
    title: '使用者',
    cli:   'owner',
    fields: [
      f('user.long_name',   '長名稱',    'string', 'MokyaLora-XXXX'),
      f('user.short_name',  '短名稱',    'string', 'MOKY'),
      f('user.is_licensed', '已認證 HAM','bool',   false),
      f('user.public_key',  '公鑰',       'string', '(32B)'),
    ],
  },
};

// ── Module configs ────────────────────────────────────────────────────
export const MODULE_GROUPS = {
  mqtt: {
    title: 'MQTT',
    cli:   'mqtt',
    fields: [
      f('mqtt.enabled',                'MQTT 啟用',          'bool',   false),
      f('mqtt.address',                'Server',             'string', 'mqtt.meshtastic.org'),
      f('mqtt.username',               'Username',           'string', ''),
      f('mqtt.password',               'Password',           'string', ''),
      f('mqtt.encryption_enabled',     '加密',                'bool',   true),
      f('mqtt.json_enabled',           'JSON',                'bool',   false),
      f('mqtt.tls_enabled',            'TLS',                 'bool',   false),
      f('mqtt.root',                   'Root topic',         'string', 'msh'),
      f('mqtt.proxy_to_client_enabled','Proxy to client',     'bool',   false),
      f('mqtt.map_reporting_enabled',  '地圖回報',             'bool',   false),
      f('mqtt.map_report_settings.publish_interval_secs', '回報週期', 'int', 7200, { unit: 's' }),
      f('mqtt.map_report_settings.position_precision',    '位置精度', 'int', 14),
    ],
  },

  serial: {
    title: 'Serial Module',
    cli:   'serial',
    fields: [
      f('serial.enabled',  'Serial 模組啟用',  'bool', false),
      f('serial.echo',     'Echo',            'bool', false),
      f('serial.rxd',      'RX GPIO',         'int',  0),
      f('serial.txd',      'TX GPIO',         'int',  0),
      f('serial.baud',     'Baud',            'enum', 'BAUD_DEFAULT', {
        options: ['BAUD_DEFAULT','BAUD_110','BAUD_300','BAUD_600','BAUD_1200','BAUD_2400','BAUD_4800','BAUD_9600','BAUD_19200','BAUD_38400','BAUD_57600','BAUD_115200','BAUD_230400','BAUD_460800','BAUD_576000','BAUD_921600'] }),
      f('serial.timeout',  '逾時',             'int',  0,    { unit: 'ms' }),
      f('serial.mode',     '模式',             'enum', 'DEFAULT', {
        options: ['DEFAULT','SIMPLE','PROTO','TEXTMSG','NMEA','CALTOPO','WS85'] }),
      f('serial.override_console_serial_port', '覆寫 Console', 'bool', false),
    ],
  },

  external_notification: {
    title: 'External Notif',
    cli:   'external_notification',
    fields: [
      f('external_notification.enabled',                  '啟用',               'bool', false),
      f('external_notification.output_ms',                'Output 持續時間',     'int',  0,    { unit: 'ms' }),
      f('external_notification.output',                   'Output GPIO',        'int',  0),
      f('external_notification.output_vibra',             '震動 GPIO',           'int',  0),
      f('external_notification.output_buzzer',            'Buzzer GPIO',        'int',  0),
      f('external_notification.active',                   'Active high',        'bool', false),
      f('external_notification.alert_message',            '訊息提醒',             'bool', false),
      f('external_notification.alert_message_buzzer',     '訊息 Buzzer',         'bool', false),
      f('external_notification.alert_message_vibra',      '訊息 Vibra',          'bool', false),
      f('external_notification.alert_bell',               'Bell 提醒',           'bool', false),
      f('external_notification.alert_bell_buzzer',        'Bell Buzzer',        'bool', false),
      f('external_notification.alert_bell_vibra',         'Bell Vibra',         'bool', false),
      f('external_notification.use_pwm',                  '使用 PWM',             'bool', false),
      f('external_notification.nag_timeout',              'Nag timeout',        'int',  0,    { unit: 's' }),
      f('external_notification.use_i2s_as_buzzer',        'I2S 當 Buzzer',      'bool', false),
    ],
  },

  store_forward: {
    title: 'Store & Fwd',
    cli:   'store_forward',
    fields: [
      f('store_forward.enabled',             '啟用',                 'bool', false),
      f('store_forward.heartbeat',           'Heartbeat',           'bool', false),
      f('store_forward.records',             '訊息保留筆數',          'int',  0),
      f('store_forward.history_return_max',  '歷史回傳最大',          'int',  0),
      f('store_forward.history_return_window','歷史回傳視窗',         'int',  0,    { unit: 'min' }),
      f('store_forward.is_server',           'Server 模式',          'bool', false),
    ],
  },

  range_test: {
    title: 'Range Test',
    cli:   'range_test',
    fields: [
      f('range_test.enabled', '啟用',         'bool', false),
      f('range_test.sender',  '發送間隔',     'int',  0,    { unit: 's' }),
      f('range_test.save',    '儲存日誌',     'bool', false),
    ],
  },

  telemetry: {
    title: 'Telemetry',
    cli:   'telemetry',
    fields: [
      f('telemetry.device_update_interval',           '裝置遙測週期',       'int',  900,  { unit: 's' }),
      f('telemetry.environment_update_interval',      '環境遙測週期',        'int',  0,    { unit: 's' }),
      f('telemetry.environment_measurement_enabled',  '環境量測啟用',         'bool', false),
      f('telemetry.environment_screen_enabled',       '環境螢幕顯示',         'bool', false),
      f('telemetry.environment_display_fahrenheit',   '華氏顯示',            'bool', false),
      f('telemetry.air_quality_enabled',              '空氣品質啟用',         'bool', false),
      f('telemetry.air_quality_interval',             '空氣品質週期',         'int',  0,    { unit: 's' }),
      f('telemetry.power_measurement_enabled',        '電力量測啟用',         'bool', false),
      f('telemetry.power_update_interval',            '電力遙測週期',         'int',  0,    { unit: 's' }),
      f('telemetry.power_screen_enabled',             '電力螢幕顯示',         'bool', false),
      f('telemetry.health_measurement_enabled',       '健康量測啟用',         'bool', false),
      f('telemetry.health_update_interval',           '健康遙測週期',         'int',  0,    { unit: 's' }),
      f('telemetry.health_screen_enabled',            '健康螢幕顯示',         'bool', false),
    ],
  },

  canned_message: {
    title: 'Canned Msg',
    cli:   'canned_message',
    fields: [
      f('canned_message.rotary1_enabled',         'Rotary1 啟用',          'bool', false),
      f('canned_message.inputbroker_pin_a',       'Input pin A',           'int',  0),
      f('canned_message.inputbroker_pin_b',       'Input pin B',           'int',  0),
      f('canned_message.inputbroker_pin_press',   'Input press pin',       'int',  0),
      f('canned_message.inputbroker_event_cw',    'Event CW',              'enum', 'NONE',
        { options: ['NONE','KEY_UP','KEY_DOWN','KEY_LEFT','KEY_RIGHT','KEY_SELECT','KEY_BACK','KEY_CANCEL'] }),
      f('canned_message.inputbroker_event_ccw',   'Event CCW',             'enum', 'NONE',
        { options: ['NONE','KEY_UP','KEY_DOWN','KEY_LEFT','KEY_RIGHT','KEY_SELECT','KEY_BACK','KEY_CANCEL'] }),
      f('canned_message.inputbroker_event_press', 'Event Press',           'enum', 'NONE',
        { options: ['NONE','KEY_UP','KEY_DOWN','KEY_LEFT','KEY_RIGHT','KEY_SELECT','KEY_BACK','KEY_CANCEL'] }),
      f('canned_message.updown1_enabled',         'UpDown1 啟用',          'bool', false),
      f('canned_message.enabled',                 'Canned msg 啟用',       'bool', false),
      f('canned_message.allow_input_source',      '允許輸入來源',           'string', '_any'),
      f('canned_message.send_bell',               'Send Bell',             'bool', false),
    ],
  },

  audio: {
    title: 'Audio',
    cli:   'audio',
    fields: [
      f('audio.codec2_enabled', 'Codec2 啟用',  'bool', false),
      f('audio.ptt_pin',        'PTT GPIO',     'int',  0),
      f('audio.bitrate',        'Bitrate',      'enum', 'CODEC2_DEFAULT', {
        options: ['CODEC2_DEFAULT','CODEC2_3200','CODEC2_2400','CODEC2_1600','CODEC2_1400','CODEC2_1300','CODEC2_1200','CODEC2_700','CODEC2_700B'] }),
      f('audio.i2s_ws',         'I2S WS GPIO',  'int', 0),
      f('audio.i2s_sd',         'I2S SD GPIO',  'int', 0),
      f('audio.i2s_din',        'I2S DIN GPIO', 'int', 0),
      f('audio.i2s_sck',        'I2S SCK GPIO', 'int', 0),
    ],
  },

  remote_hardware: {
    title: 'Remote HW',
    cli:   'remote_hardware',
    fields: [
      f('remote_hardware.enabled',                     '啟用',           'bool',   false),
      f('remote_hardware.allow_undefined_pin_access',  '允許未定義腳位', 'bool',   false),
      f('remote_hardware.available_pins',              '可用 GPIO',      'string', '(repeated)'),
    ],
  },

  neighbor_info: {
    title: 'Neighbor Info',
    cli:   'neighbor_info',
    fields: [
      f('neighbor_info.enabled',           '啟用',           'bool', false),
      f('neighbor_info.update_interval',   '更新週期',       'int',  900, { unit: 's' }),
      f('neighbor_info.transmit_over_lora','透過 LoRa 廣播', 'bool', false),
    ],
  },

  ambient_lighting: {
    title: 'Ambient Light',
    cli:   'ambient_lighting',
    fields: [
      f('ambient_lighting.led_state', 'LED 狀態',  'bool', false),
      f('ambient_lighting.current',   '電流',       'int',  0,   { unit: 'mA' }),
      f('ambient_lighting.red',       'R',          'int',  0,   { unit: '/255' }),
      f('ambient_lighting.green',     'G',          'int',  0,   { unit: '/255' }),
      f('ambient_lighting.blue',      'B',          'int',  0,   { unit: '/255' }),
    ],
  },

  detection_sensor: {
    title: 'Detection Sensor',
    cli:   'detection_sensor',
    fields: [
      f('detection_sensor.enabled',                 '啟用',           'bool', false),
      f('detection_sensor.minimum_broadcast_secs',  '最小廣播間隔',   'int',  0,   { unit: 's' }),
      f('detection_sensor.state_broadcast_secs',    '狀態廣播間隔',   'int',  0,   { unit: 's' }),
      f('detection_sensor.send_bell',               '發送 Bell',       'bool', false),
      f('detection_sensor.name',                    '名稱',           'string', ''),
      f('detection_sensor.monitor_pin',             '監測 GPIO',     'int',  0),
      f('detection_sensor.detection_triggered_high','觸發極性',       'bool', true),
      f('detection_sensor.use_pullup',              '使用 pull-up',  'bool', false),
    ],
  },

  paxcounter: {
    title: 'PAX Counter',
    cli:   'paxcounter',
    fields: [
      f('paxcounter.enabled',                  '啟用',           'bool', false),
      f('paxcounter.paxcounter_update_interval','更新週期',     'int',  300, { unit: 's' }),
      f('paxcounter.wifi_threshold',           'WiFi RSSI 門檻','int', -80, { unit: 'dBm' }),
      f('paxcounter.ble_threshold',            'BLE RSSI 門檻', 'int', -80, { unit: 'dBm' }),
    ],
  },
};

// ── Channel slots (8 max) ─────────────────────────────────────────────
export const CHANNELS = Array.from({ length: 8 }, (_, i) => ({
  index: i,
  fields: [
    f(`channels.${i}.role`, '角色', 'enum',
      i === 0 ? 'PRIMARY' : 'DISABLED',
      { options: ['DISABLED','PRIMARY','SECONDARY'] }),
    f(`channels.${i}.settings.name`,             '名稱',         'string', i === 0 ? 'LongFast' : ''),
    f(`channels.${i}.settings.psk`,              'PSK',          'string', i === 0 ? '(default)' : ''),
    f(`channels.${i}.settings.id`,               'ID',           'int',    0),
    f(`channels.${i}.settings.uplink_enabled`,   'Uplink',       'bool',   false),
    f(`channels.${i}.settings.downlink_enabled`, 'Downlink',     'bool',   false),
    f(`channels.${i}.settings.module_settings.position_precision`, '位置精度',     'int',  14),
    f(`channels.${i}.settings.module_settings.is_client_muted`,    'Client muted', 'bool', false),
  ],
}));

// ── Top-level mesh-config menu structure ──────────────────────────────
export const MESH_CONFIG_MENU = [
  { kind: 'group',     key: 'device',     label: '裝置' },
  { kind: 'group',     key: 'lora',       label: 'LoRa' },
  { kind: 'group',     key: 'position',   label: '位置' },
  { kind: 'group',     key: 'power',      label: '電源' },
  { kind: 'group',     key: 'network',    label: '網路' },
  { kind: 'group',     key: 'display',    label: '顯示' },
  { kind: 'group',     key: 'bluetooth',  label: '藍牙' },
  { kind: 'group',     key: 'security',   label: '安全' },
  { kind: 'group',     key: 'user',       label: '使用者' },
  { kind: 'modules',                       label: '模組設定' },
  { kind: 'channels',                      label: '頻道' },
];
