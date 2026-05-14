(function () {
  const STORAGE_PREFIX = "pixel-liar-dice-room:";
  const PLAYER_KEY = "pixel-liar-dice-player-id";
  const CHANNEL_NAME = "pixel-liar-dice-sync";
  const DICE_PER_PLAYER = 5;

  const app = document.querySelector("#app");
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  const { isHigherBid, isLegalBid, legalBidOptions, countBidMatches: countDiceGroupsForBid } = window.LiarDiceRules;
  const firebaseConfig = window.FIREBASE_CONFIG || {};
  const firebaseEnabled = Boolean(window.firebase && firebaseConfig.apiKey && firebaseConfig.databaseURL);
  const database = firebaseEnabled ? window.firebase.initializeApp(firebaseConfig).database() : null;
  const remoteRooms = {};
  let watchedRoomCode = null;
  let watchedRoomRef = null;
  let shaking = false;
  let showDice = true;
  let noticeText = "";

  const pipMap = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  function getPlayerId() {
    let id = sessionStorage.getItem(PLAYER_KEY);
    if (!id) {
      id = makePlayerId();
      setPlayerId(id);
    }
    return id;
  }

  function makePlayerId() {
    return "p_" + Math.random().toString(36).slice(2, 10);
  }

  function setPlayerId(id) {
    sessionStorage.setItem(PLAYER_KEY, id);
  }

  function getRoomCodeFromUrl() {
    return new URLSearchParams(location.search).get("room");
  }

  function roomKey(code) {
    return STORAGE_PREFIX + code;
  }

  function roomPath(code) {
    return "rooms/" + code;
  }

  function watchRoom(code) {
    if (!firebaseEnabled || !code || watchedRoomCode === code) return;
    if (watchedRoomRef) watchedRoomRef.off();
    watchedRoomCode = code;
    watchedRoomRef = database.ref(roomPath(code));
    watchedRoomRef.on("value", (snapshot) => {
      const room = snapshot.val();
      if (room) {
        remoteRooms[code] = room;
      } else {
        delete remoteRooms[code];
      }
      render();
    });
  }

  function fetchRemoteRoom(code) {
    if (!firebaseEnabled) return Promise.resolve(null);
    return database.ref(roomPath(code)).once("value").then((snapshot) => snapshot.val());
  }

  function readRoom(code) {
    if (!code) return null;
    if (firebaseEnabled) return remoteRooms[code] || null;
    try {
      const raw = localStorage.getItem(roomKey(code));
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      noticeText = "浏览器没有允许保存房间数据。请用 http://localhost:5173 打开，不要直接打开文件。";
      return null;
    }
  }

  function saveRoom(room) {
    room.updatedAt = Date.now();
    if (firebaseEnabled) {
      remoteRooms[room.code] = room;
      database.ref(roomPath(room.code)).set(room).catch(() => {
        noticeText = "线上房间保存失败。请检查 Firebase 配置和数据库规则。";
        render();
      });
      render();
      return;
    }
    try {
      localStorage.setItem(roomKey(room.code), JSON.stringify(room));
    } catch (error) {
      noticeText = "浏览器没有允许保存房间数据。请用 http://localhost:5173 打开，不要直接打开文件。";
      render();
      return;
    }
    if (channel) channel.postMessage({ code: room.code });
    render();
  }

  function makeRoom(name, mode) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const playerId = getPlayerId();
    const room = {
      code,
      mode: mode || "online",
      hostId: playerId,
      phase: "lobby",
      round: 1,
      currentIndex: 0,
      lastBid: null,
      bids: [],
      result: null,
      players: [
        {
          id: playerId,
          name: cleanName(name) || "房主",
          dice: [],
          rolled: false
        }
      ]
    };
    history.replaceState(null, "", "?room=" + code);
    watchRoom(code);
    saveRoom(room);
  }

  function cleanName(value) {
    return String(value || "").trim().slice(0, 10);
  }

  function updateRoom(mutator) {
    const code = getRoomCodeFromUrl();
    const room = readRoom(code);
    if (!room) return;
    mutator(room);
    saveRoom(room);
  }

  async function joinRoom(code, name) {
    const normalizedCode = String(code || "").trim();
    if (!normalizedCode) {
      noticeText = "先输入房间号，再点加入房间。";
      render();
      return;
    }

    let room = readRoom(normalizedCode);
    if (!room && firebaseEnabled) {
      room = await fetchRemoteRoom(normalizedCode);
      if (room) remoteRooms[normalizedCode] = room;
    }
    if (!room) {
      noticeText = "没有找到这个房间。请先让房主创建房间，再输入房间号加入。";
      render();
      return;
    }

    let playerId = getPlayerId();
    const existing = room.players.find((player) => player.id === playerId);
    if (existing) {
      playerId = makePlayerId();
      setPlayerId(playerId);
    }

    room.players.push({
      id: playerId,
      name: cleanName(name) || "玩家" + (room.players.length + 1),
      dice: [],
      rolled: false
    });

    noticeText = "";
    history.replaceState(null, "", "?room=" + normalizedCode);
    watchRoom(normalizedCode);
    saveRoom(room);
  }

  function rollDice() {
    return Array.from({ length: DICE_PER_PLAYER }, () => Math.floor(Math.random() * 6) + 1);
  }

  function startRound() {
    updateRoom((room) => {
      room.phase = "shaking";
      room.result = null;
      room.lastBid = null;
      room.bids = [];
      room.currentIndex = 0;
      room.players.forEach((player) => {
        player.dice = [];
        player.rolled = false;
      });
      if (room.players.every((player) => player.rolled)) {
        room.phase = room.mode === "face" ? "readyToReveal" : "bidding";
      }
    });
  }

  function shakeMine() {
    shaking = true;
    render();
    if (navigator.vibrate) navigator.vibrate([80, 40, 120]);
    setTimeout(() => {
      updateRoom((room) => {
        const player = room.players.find((item) => item.id === getPlayerId());
        if (!player) return;
        player.dice = rollDice();
        player.rolled = true;
        if (room.players.every((item) => item.rolled)) {
          room.phase = room.mode === "face" ? "readyToReveal" : "bidding";
          room.currentIndex = 0;
        }
      });
      shaking = false;
      showDice = true;
      render();
    }, 850);
  }

  function submitBid() {
    const count = Number(document.querySelector("#bid-count").value);
    const face = Number(document.querySelector("#bid-face").value);
    const requestedZhai = Boolean(document.querySelector("#bid-zhai")?.checked);
    updateRoom((room) => {
      const current = room.players[room.currentIndex];
      const zhai = requestedZhai || hasZhaiStarted(room);
      const bid = { playerId: current.id, playerName: current.name, count, face, zhai };
      if (!isLegalBid(bid, room.lastBid, hasZhaiStarted(room))) return;
      room.lastBid = bid;
      room.bids.push(bid);
      room.currentIndex = (room.currentIndex + 1) % room.players.length;
    });
  }

  function resolveChallenge(room) {
    if (!room.lastBid) return;
    const challenger = room.players[room.currentIndex];
    const bidder = room.players.find((player) => player.id === room.lastBid.playerId);
    const actual = countBidMatches(room.players, room.lastBid);
    const bidWasTrue = actual >= room.lastBid.count;
    const loser = bidWasTrue ? challenger : bidder;
    room.phase = "reveal";
    room.result = {
      actual,
      bidWasTrue,
      loserId: loser.id,
      loserName: loser.name,
      challengerName: challenger.name,
      bidderName: bidder.name,
      bid: room.lastBid
    };
  }

  function challenge() {
    updateRoom((room) => {
      resolveChallenge(room);
    });
  }

  function revealFaceToFace() {
    updateRoom((room) => {
      if (room.mode !== "face") return;
      room.phase = "reveal";
      room.result = null;
    });
  }

  function nextRound() {
    updateRoom((room) => {
      const lastLoserId = room.result?.loserId;
      room.round += 1;
      room.phase = "shaking";
      room.result = null;
      room.lastBid = null;
      room.bids = [];
      const loserIndex = Math.max(
        0,
        room.players.findIndex((player) => player.id === lastLoserId)
      );
      room.currentIndex = loserIndex;
      room.players.forEach((player) => {
        player.dice = [];
        player.rolled = false;
      });
      if (room.players.every((player) => player.rolled)) {
        room.phase = room.mode === "face" ? "readyToReveal" : "bidding";
      }
    });
  }

  function resetRoom() {
    updateRoom((room) => {
      room.phase = "lobby";
      room.round = 1;
      room.currentIndex = 0;
      room.lastBid = null;
      room.bids = [];
      room.result = null;
      room.players.forEach((player) => {
        player.dice = [];
        player.rolled = false;
      });
    });
  }

  function dieHtml(value) {
    const on = pipMap[value] || [];
    return `<div class="die" aria-label="${value}点">${Array.from({ length: 9 }, (_, index) => {
      return `<span class="pip ${on.includes(index) ? "on" : ""}"></span>`;
    }).join("")}</div>`;
  }

  function diceHtml(dice, visible) {
    if (!dice.length) return `<div class="hidden-dice">还没摇骰</div>`;
    if (!visible) return `<div class="hidden-dice">骰子已盖住</div>`;
    return `<div class="dice-row">${dice.map(dieHtml).join("")}</div>`;
  }

  function stageName(phase) {
    return {
      lobby: "等朋友加入",
      shaking: "大家摇骰",
      readyToReveal: "现场喊数",
      bidding: "轮流报数",
      reveal: "开盅结果"
    }[phase];
  }

  function modeName(mode) {
    return mode === "face" ? "面对面模式" : "线上模式";
  }

  function landingHtml(roomCode) {
    const fileWarning =
      location.protocol === "file:"
        ? `<p class="alert">现在是直接打开文件模式。请改用 http://localhost:5173，这样创建和加入房间更稳定。</p>`
        : "";
    return `
      <main class="app-shell">
        <section class="topbar">
          <div class="brand">
            <div class="logo"></div>
            <div>
              <h1>吹牛骰</h1>
              <p class="subtitle">像素酒桌房间 · 手机网页试玩版</p>
            </div>
          </div>
        </section>
        <section class="layout">
          <div class="panel stack">
            <h2>创建房间</h2>
            <p class="notice">先做本地试玩版：同一台电脑的多个浏览器标签页可以模拟多人。后面接 Firebase 后，朋友手机就能真正联网进入。</p>
            <p class="status-note">${firebaseEnabled ? "线上同步已开启" : "当前是本地试玩，填好 Firebase 配置后可联网"}</p>
            ${fileWarning}
            ${noticeText ? `<p class="alert">${escapeHtml(noticeText)}</p>` : ""}
            <input id="create-name" maxlength="10" placeholder="你的昵称" />
            <div class="mode-grid">
              <label class="mode-option">
                <input type="radio" name="room-mode" value="online" checked />
                <span>线上模式</span>
                <small>手机里报数，系统判断输赢</small>
              </label>
              <label class="mode-option">
                <input type="radio" name="room-mode" value="face" />
                <span>面对面模式</span>
                <small>现场喊数，只摇骰、开盅、统计</small>
              </label>
            </div>
            <button id="create-room">创建房间</button>
          </div>
          <div class="panel stack">
            <h2>加入房间</h2>
            <input id="join-code" inputmode="numeric" maxlength="4" value="${roomCode || ""}" placeholder="房间号" />
            <input id="join-name" maxlength="10" placeholder="你的昵称" />
            <button id="join-room">加入房间</button>
          </div>
        </section>
      </main>
    `;
  }

  function roomHtml(room) {
    const me = room.players.find((player) => player.id === getPlayerId());
    const isHost = me?.id === room.hostId;
    const current = room.players[room.currentIndex];
    const isMyTurn = current?.id === me?.id;
    const maxCount = Math.max(DICE_PER_PLAYER, room.players.length * DICE_PER_PLAYER);
    const minCount = room.lastBid ? room.lastBid.count : 1;

    return `
      <main class="app-shell">
        <section class="topbar">
          <div class="brand">
            <div class="logo"></div>
            <div>
              <h1>房间 <span class="room-code">${room.code}</span></h1>
              <p class="subtitle">第 ${room.round} 局 · ${modeName(room.mode)} · ${stageName(room.phase)}</p>
            </div>
          </div>
          <button class="secondary" id="leave-room">返回</button>
        </section>

        <section class="layout">
          <div class="stack">
            <div class="panel cup-zone">
              <div class="cup ${shaking ? "shaking" : ""}"></div>
              ${diceHtml(me?.dice || [], room.phase === "reveal" || showDice)}
              <div class="controls-grid">
                <button id="shake" ${room.phase !== "shaking" || !me || me.rolled ? "disabled" : ""}>摇骰</button>
                <button class="secondary" id="toggle-dice" ${!me?.dice?.length || room.phase === "reveal" ? "disabled" : ""}>${showDice ? "盖住骰子" : "偷看骰子"}</button>
              </div>
            </div>

            ${room.mode === "face" ? faceModePanelHtml(room, isHost) : biddingHtml(room, isMyTurn, maxCount, minCount)}
            ${room.mode === "face" ? faceModeResultHtml(room) : resultHtml(room)}
          </div>

          <aside class="stack">
            <div class="panel stack">
              <div class="row">
                <h2>玩家</h2>
                <span class="status-pill">${room.players.length} 人</span>
              </div>
              <p class="notice">让朋友加入：打开 http://localhost:5173，输入房间号 ${room.code}。本地试玩时，请新开一个标签页，不要直接双击文件打开。</p>
              <div class="players">
                ${room.players
                  .map((player, index) => {
                    const isCurrent = room.phase === "bidding" && index === room.currentIndex;
                    return `
                      <div class="player ${isCurrent ? "current" : ""}">
                        <span class="player-name">${escapeHtml(player.name)}${player.id === room.hostId ? " · 房主" : ""}</span>
                        <span class="status-pill">${player.rolled ? "已摇" : "等待"}</span>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
              <button id="start-round" ${room.players.length < 2 || room.phase !== "lobby" || !isHost ? "disabled" : ""}>开始</button>
              <button class="secondary" id="reset-room" ${!isHost ? "disabled" : ""}>重置房间</button>
            </div>

            ${room.mode === "online" ? `<div class="panel stack">
              <h2>报数记录</h2>
              <div class="history">
                ${
                  room.bids.length
                    ? room.bids
                        .map((bid) => `<div class="history-item">${escapeHtml(bid.playerName)}：${bidText(bid)}</div>`)
                        .join("")
                    : `<div class="empty">还没有人报数</div>`
                }
              </div>
            </div>` : ""}
          </aside>
        </section>
      </main>
    `;
  }

  function biddingHtml(room, isMyTurn, maxCount, minCount) {
    if (room.phase !== "bidding") return "";
    const zhaiActive = hasZhaiStarted(room);
    const lastText = room.lastBid
      ? `上一口：${escapeHtml(room.lastBid.playerName)} 报 ${bidText(room.lastBid)}`
      : "还没人报数";
    const legalCounts = legalBidCounts(room, maxCount, minCount, zhaiActive);
    const safeDefaultCount = legalCounts[0] || maxCount;
    const canBid = legalCounts.length > 0;
    return `
      <div class="panel bid-board">
        <div class="row">
          <h2>轮到：${escapeHtml(room.players[room.currentIndex].name)}</h2>
          <span class="status-pill">${lastText}</span>
        </div>
        <div class="row">
          <select id="bid-count" ${!isMyTurn ? "disabled" : ""}>
            ${legalCounts
              .map((count) => `<option value="${count}" ${count === safeDefaultCount ? "selected" : ""}>${count} 个</option>`)
              .join("")}
          </select>
          <select id="bid-face" ${!isMyTurn ? "disabled" : ""}>
            ${bidFaceOptions(room, safeDefaultCount, zhaiActive)}
          </select>
        </div>
        <label class="check-row">
          <input id="bid-zhai" type="checkbox" ${zhaiActive ? "checked" : ""} ${!isMyTurn || zhaiActive ? "disabled" : ""} />
          <span>${zhaiActive ? "本局已斋：1 不当万能点" : "斋：1 不当万能点"}</span>
        </label>
        <p class="notice">同数量要加点数；数量可以增加，也可以最多往下少 2。</p>
        <div class="controls-grid">
          <button id="submit-bid" ${!isMyTurn || !canBid ? "disabled" : ""}>报数</button>
          <button class="danger" id="challenge" ${!isMyTurn || !room.lastBid ? "disabled" : ""}>开盅</button>
        </div>
      </div>
    `;
  }

  function legalBidCounts(room, maxCount, minCount, zhai) {
    return Array.from({ length: maxCount }, (_, index) => index + 1).filter((count) => {
      if (!room.lastBid && count < minCount) return false;
      return [1, 2, 3, 4, 5, 6].some((face) =>
        isLegalBid({ count, face, zhai }, room.lastBid, hasZhaiStarted(room))
      );
    });
  }

  function bidFaceOptions(room, selectedCount, zhai) {
    const faces = [1, 2, 3, 4, 5, 6]
      .filter((face) => isLegalBid({ count: selectedCount, face, zhai }, room.lastBid, hasZhaiStarted(room)))
      .map((face, index) => `<option value="${face}" ${index === 0 ? "selected" : ""}>${face} 点</option>`);
    return faces.length ? faces.join("") : `<option value="">只能开盅</option>`;
  }

  function hasZhaiStarted(room) {
    return room.bids.some((bid) => bid.zhai);
  }

  function faceModePanelHtml(room, isHost) {
    if (room.phase === "lobby") {
      return `<div class="panel stack"><h2>面对面模式</h2><p class="notice">开始后，每个人只看自己的骰子。报数用嘴喊，手机只负责开盅和统计。</p></div>`;
    }

    if (room.phase === "shaking") {
      return `<div class="panel stack"><h2>等待摇骰</h2><p class="notice">等所有玩家都摇完，就可以现场喊数了。</p></div>`;
    }

    if (room.phase === "readyToReveal") {
      return `
        <div class="panel stack">
          <h2>现场喊数</h2>
          <p class="notice">现在大家用嘴报数。有人要开时，房主点开盅。</p>
          <button class="danger" id="face-reveal" ${!isHost ? "disabled" : ""}>开盅</button>
        </div>
      `;
    }

    return "";
  }

  function faceModeResultHtml(room) {
    if (room.phase !== "reveal") return "";
    const totals = countDiceFaces(room.players);
    return `
      <div class="panel result">
        <h2>开盅统计</h2>
        <div class="stats-grid">
          ${[1, 2, 3, 4, 5, 6]
            .map((face) => `<div class="stat-tile"><strong>${face} 点</strong><span>${totals[face]} 个</span></div>`)
            .join("")}
        </div>
        <div class="players">
          ${room.players
            .map(
              (player) => `
                <div class="player">
                  <span class="player-name">${escapeHtml(player.name)}</span>
                  ${diceHtml(player.dice, true)}
                </div>
              `
            )
            .join("")}
        </div>
        <button id="next-round">下一局</button>
      </div>
    `;
  }

  function countDiceFaces(players) {
    const totals = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    players.flatMap((player) => player.dice).forEach((value) => {
      totals[value] += 1;
    });
    return totals;
  }

  function countBidMatches(players, bid) {
    return countDiceGroupsForBid(
      players.map((player) => player.dice),
      bid
    );
  }

  function bidText(bid) {
    return `${bid.zhai ? "斋 " : ""}${bid.count} 个 ${bid.face}`;
  }

  function resultHtml(room) {
    if (room.phase !== "reveal" || !room.result) return "";
    return `
      <div class="panel result">
        <h2>开盅</h2>
        <p>${escapeHtml(room.result.bidderName)} 报 <strong>${bidText(room.result.bid)}</strong>，实际有 <strong>${room.result.actual} 个</strong>。</p>
        <p>${room.result.bidWasTrue ? "报数成立，开盅的人输。" : "报数不成立，上一位报数的人输。"}</p>
        <p>本局输家：<strong>${escapeHtml(room.result.loserName)}</strong></p>
        <div class="players">
          ${room.players
            .map(
              (player) => `
                <div class="player">
                  <span class="player-name">${escapeHtml(player.name)}</span>
                  ${diceHtml(player.dice, true)}
                </div>
              `
            )
            .join("")}
        </div>
        <button id="next-round">下一局</button>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function bindLanding() {
    document.querySelector("#create-room")?.addEventListener("click", () => {
      makeRoom(
        document.querySelector("#create-name").value,
        document.querySelector("input[name='room-mode']:checked")?.value
      );
    });
    document.querySelector("#join-room")?.addEventListener("click", () => {
      joinRoom(document.querySelector("#join-code").value, document.querySelector("#join-name").value);
    });
  }

  function bindRoom() {
    document.querySelector("#leave-room")?.addEventListener("click", () => {
      history.replaceState(null, "", location.pathname);
      render();
    });
    document.querySelector("#start-round")?.addEventListener("click", startRound);
    document.querySelector("#reset-room")?.addEventListener("click", resetRoom);
    document.querySelector("#shake")?.addEventListener("click", shakeMine);
    document.querySelector("#toggle-dice")?.addEventListener("click", () => {
      showDice = !showDice;
      render();
    });
    document.querySelector("#bid-count")?.addEventListener("change", (event) => {
      const code = getRoomCodeFromUrl();
      const room = readRoom(code);
      const faceSelect = document.querySelector("#bid-face");
      if (!room || !faceSelect) return;
      const zhai = Boolean(document.querySelector("#bid-zhai")?.checked) || hasZhaiStarted(room);
      faceSelect.innerHTML = bidFaceOptions(room, Number(event.target.value), zhai);
    });
    document.querySelector("#bid-zhai")?.addEventListener("change", (event) => {
      const code = getRoomCodeFromUrl();
      const room = readRoom(code);
      const countSelect = document.querySelector("#bid-count");
      const faceSelect = document.querySelector("#bid-face");
      if (!room || !countSelect || !faceSelect) return;
      const zhai = Boolean(event.target.checked) || hasZhaiStarted(room);
      const maxCount = Math.max(DICE_PER_PLAYER, room.players.length * DICE_PER_PLAYER);
      const minCount = room.lastBid ? room.lastBid.count : 1;
      const legalCounts = legalBidCounts(room, maxCount, minCount, zhai);
      const selectedCount = legalCounts.includes(Number(countSelect.value)) ? Number(countSelect.value) : legalCounts[0];
      countSelect.innerHTML = legalCounts
        .map((count) => `<option value="${count}" ${count === selectedCount ? "selected" : ""}>${count} 个</option>`)
        .join("");
      faceSelect.innerHTML = bidFaceOptions(room, selectedCount, zhai);
    });
    document.querySelector("#submit-bid")?.addEventListener("click", submitBid);
    document.querySelector("#challenge")?.addEventListener("click", challenge);
    document.querySelector("#face-reveal")?.addEventListener("click", revealFaceToFace);
    document.querySelector("#next-round")?.addEventListener("click", nextRound);
  }

  function render() {
    const code = getRoomCodeFromUrl();
    const room = readRoom(code);
    if (!code || !room) {
      if (code && firebaseEnabled) {
        watchRoom(code);
        fetchRemoteRoom(code).then((remoteRoom) => {
          if (remoteRoom) {
            remoteRooms[code] = remoteRoom;
            render();
          }
        });
      }
      app.innerHTML = landingHtml(code);
      bindLanding();
      return;
    }
    watchRoom(code);
    room.mode = room.mode || "online";
    room.players = room.players.filter((player) => !player.bot);
    app.innerHTML = roomHtml(room);
    bindRoom();
  }

  window.addEventListener("storage", render);
  window.addEventListener("popstate", render);
  if (channel) {
    channel.addEventListener("message", (event) => {
      if (event.data?.code === getRoomCodeFromUrl()) render();
    });
  }

  render();
})();
