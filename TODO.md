# TODO

Outstanding work, grouped by area. ✅ items are reference points showing
what's already in place; ⬜ items are pending. Effort-tagged where
relevant: **S** ≈ < 1 h, **M** ≈ a few hours, **L** ≈ a day or more.

---

## Recently shipped (2026-04 batch)

✅ Non-touch DPAD UI: HomeScreen → MenuScreen → 6-tile feature grid
✅ MESHTASTIC sub-menu: 訊息 / 節點 / 地圖 / 設定 / 連接
✅ Nodes: list + detail (資訊 / 動作 / 歷史 tabs) + per-node signal /
   traceroute / ACK history with sparkline
✅ Mesh-config full settings tree (~240 fields, 9 groups + 13 modules
   + 8 channel slots) with localStorage persistence
✅ Field editor: bool toggle, enum picker, int/float stepper, string
   via MIE composition
✅ System settings tree (顯示/輸入法/語言/提示音/電源/除錯/關於)
✅ Sensors screen (6 sensors mock + sparkline detail)
✅ Battery screen (charge state machine + glyph + 11-row detail)
✅ Connect screen with WebSerial connect/disconnect
✅ Map integrated with live NODES + OK opens NodeDetail
✅ WebSerial Part 1: FromRadio decoder, NodeInfo upsert
✅ WebSerial Part 2: ToRadio encoders for sendtext / traceroute /
   request-position / request-telemetry / admin reboot/shutdown/
   favorite/ignored/remove-node; node-detail actions branch
   live ↔ mock
✅ Unifont 16-px MIEF v1 bitmap font replaces canvas system text
✅ Width-packed candidate paging with UP/DOWN
✅ Per-conversation chat context (channel vs DM header)

---

## #8 WebSerial Part 3 — wire the protobuf streams into existing UI

⬜ **Config sub-message decoding → CONFIG_GROUPS** (M)
   FromRadio.config currently only resolves the oneof tag (group key).
   Decode each sub-message (DeviceConfig, LoRaConfig, PositionConfig,
   PowerConfig, NetworkConfig, DisplayConfig, BluetoothConfig,
   SecurityConfig) field-by-field and assign onto the matching
   `CONFIG_GROUPS.<group>.fields[*]` by `key`. After the dump
   completes the mesh-config screens display the real device's values.

⬜ **Channel decoding → CHANNELS** (S)
   Decode FromRadio.channel.settings (name, psk, role, uplink/downlink
   enabled, module_settings) into the existing CHANNELS array slot by
   index.

⬜ **ModuleConfig decoding → MODULE_GROUPS** (M)
   Same pattern as Config, for FromRadio.module_config.

⬜ **NodeDB reset on connect** (S)
   Drop the seeded mock NODES the first time a device delivers its own
   NodeInfo dump, otherwise the list mixes mock + real. Probably:
   clear the mock entries on the first FromRadio packet after connect,
   keep them when offline.

⬜ **Reverse path: edit a setting → admin protobuf write-back** (L)
   When connected, FieldEditScreen._commit should send
   AdminMessage.set_config / set_module_config / set_channel based on
   field.key prefix instead of (or in addition to) localStorage write.
   Need an encoder for AdminMessage.set_config oneof (each Config
   sub-message embedded). Probably also batch via begin_edit /
   commit_edit transactions.

⬜ **Heartbeat keepalive** (S)
   Send `ToRadio { heartbeat = {} }` every 60 s while connected. The
   firmware closes the serial session after ~3 minutes idle.

⬜ **Real Traceroute reply handling** (M)
   Decode incoming MeshPacket on TRACEROUTE_APP (RouteDiscovery
   payload) when received and call pushTracerouteResult() with the
   actual hop chain + per-hop SNRs instead of the optimistic mock.

⬜ **Real ACK timing** (M)
   Listen for FromRadio.packet on ROUTING_APP carrying Routing.error
   == NONE for the request_id we sent; measure RTT vs send timestamp
   stored in a `pending_acks` map keyed by packet id. Push to
   ack_history with the real latency.

⬜ **Position / Telemetry replies** (S)
   Decode the response packets and push onto the node's history (and
   update n.position / n.device_metrics).

⬜ **Receive text into chat-screen** (S)
   Decode incoming MeshPacket.decoded.payload on TEXT_MESSAGE_APP and
   route via existing serial:message event so the chat bubble appears
   live. Currently the receive path stops at upsertNode.

⬜ **Owner write-back** (S)
   Edit user.long_name / short_name → admin set_owner protobuf.

---

## UI gaps

⬜ **Per-recipient chat filter** (S)
   ChatScreen currently shows the full message list regardless of
   conversation context. Filter `_messages` by recipient/channel id
   when rendering.

⬜ **Messages-screen feed from real NODES** (S)
   PRIVATE_FEED is hard-coded. Build it from NODES (most-recent
   contact per node) so DM list updates as the device reports new
   senders.

⬜ **Connect-screen device info pane** (S)
   When connected, show firmware version + region + Owner short_name
   pulled from FromRadio.metadata + Config.lora.region + User.

⬜ **Real GNSS for ME position on map** (S)
   When connected and own GNSS fix is valid, replace the hard-coded
   ME_LAT/ME_LON in map-screen with the real position from
   FromRadio.my_info / NodeInfo for the local node.

⬜ **TONE1/TONE2 zoom on map** (S)
   Map zoom keys exist in handleKeyTap but TONE keys probably don't
   exist on the keyboard matrix anymore. Re-bind to a sensible pair
   (e.g. VOL_UP / VOL_DOWN) or move to LEFT/RIGHT when no node
   selected.

⬜ **BLE connection method** (M)
   `connect-screen` lists BLE as 「尚未實作」. Web Bluetooth +
   Meshtastic GATT service (UUID 6ba1b218-15a8-461f-9fa8-5dcae273eafd)
   would let mobile users connect.

⬜ **TCP connection method** (M)
   For node sitting behind WebSocket-to-TCP proxy. Lower priority.

⬜ **Channel name in conversation header** (S)
   When CHANNELS is populated from real data, ChatScreen should pull
   the actual channel name instead of "LongFast" hard-code.

⬜ **Send DM in chat → routes to clicked node from messages list** (S)
   Already wired for node-detail; messages-screen DM rows already set
   recipient. Verify the round-trip works on a real device.

---

## Polish

⬜ **Long-press SYM picker keyboard layout** (S)
   Verify the 6×6 picker grid works after the new menu system; ensure
   BACK still cancels the overlay, not the screen.

⬜ **Reconnect after serial error** (S)
   Currently after a serial:error the user has to navigate to Connect
   and OK. Auto-retry once on read-loop crash, or surface a "Retry"
   button in the home-screen status card.

⬜ **Hop / want_ack indicator in chat bubbles** (S)
   When a sent message has want_ack, show a small ✓ when the routing
   ACK arrives, ⚠ on NAK, ⏳ while pending.

⬜ **Settings QR code (--qr)** (M)
   Generate a Meshtastic channel-set URL + render a QR code on
   `MESH 設定 → 頻道 → URL`. The CLI uses ChannelSet protobuf
   serialised as base64 + meshtastic.org/e/#?...

⬜ **Theme / dark-mode** (S)
   Renderer.C palette is fixed dark. Add a system-settings switch to
   pick palette.

⬜ **Larger font option** (M)
   Generate a 24-px Unifont MIEF and switch fonts based on system-
   settings emu.display.font_size.

---

## Tooling

⬜ **Unit tests for protobuf encoders/decoders** (M)
   Round-trip tests for every encode/decode pair. Use Vitest or Node
   built-in test runner.

⬜ **CI: GitHub Actions runs `node --check` on all .js + smoke tests** (S)

⬜ **Documentation** (S)
   Inline docs for the new screens are reasonable; need a single
   ARCHITECTURE.md describing the screen tree + data flow + protobuf
   wire path.

---

## Hardware integration (after Rev A bring-up complete)

⬜ Replace mock sensors-screen readings with real IPC sensor data
⬜ Replace mock battery-screen state machine with BQ25622/BQ27441 IPC
⬜ Replace mock NODES seed with empty-on-boot, fill from device
⬜ GNSS map ME position from Teseo-LIV3FL fix
⬜ Real RSSI / SNR from incoming radio packets feeding signal_history
