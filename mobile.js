(() => {
  const page = document.querySelector("[data-mobile-page]");
  if (!page) return;

  const status = page.querySelector(".mobile-status");
  let db;
  let decks = [];
  let activeDeck;
  let cards = [];
  let allCards = [];
  let cardIndex = 0;
  let wordListViewMode = "word";
  let favoritesOnly = false;
  const params = new URLSearchParams(location.search);
  const deckId = params.get("deckId");
  const presentationMode = params.get("mode") === "meaning" ? "meaning" : "word";

  void initialize();

  async function initialize() {
    try {
      if ("serviceWorker" in navigator && ["http:", "https:"].includes(location.protocol)) {
        await navigator.serviceWorker.register(new URL("service-worker.js", document.baseURI));
      }
      db = await openDatabase();
      decks = await getAllDecks();
      if (!decks.length) {
        decks = await loadPublishedDecks();
        await replaceDecks(decks);
      }
      const pageType = page.dataset.mobilePage;
      if (pageType === "days") renderDays();
      else {
        activeDeck = decks.find((deck) => deck.id === deckId);
        if (!activeDeck) {
          status.textContent = "자료를 찾지 못했습니다. DAY 목록으로 돌아가 다시 선택해 주세요.";
          status.classList.add("error");
          return;
        }
        cards = [...activeDeck.cards].sort((first, second) =>
          (Number.isFinite(first.order) ? first.order : 0) - (Number.isFinite(second.order) ? second.order : 0)
        );
        allCards = cards;
        if (pageType === "cards" && favoritesOnly) {
          cards = allCards.filter((card) => card.favorite);
        }
        const title = page.querySelector(".mobile-title");
        if (title && pageType === "words") title.textContent = activeDeck.name;
        const wordsBack = page.querySelector(".mobile-back");
        if (wordsBack && pageType === "words") {
          wordsBack.href = `mobile.html?deckId=${encodeURIComponent(activeDeck.id)}`;
        }
        if (wordsBack && pageType === "card-type") {
          wordsBack.href = `mobile_words.html?deckId=${encodeURIComponent(activeDeck.id)}`;
        }
        const cardsBack = page.querySelector(".mobile-card-top a");
        if (cardsBack && pageType === "cards") {
          cardsBack.href = `mobile_words.html?deckId=${encodeURIComponent(activeDeck.id)}`;
        }
        if (pageType === "words") renderWords();
        else if (pageType === "card-type") renderCardType();
        else renderCard();
      }
      status.hidden = true;
    } catch (error) {
      status.textContent = `자료를 불러오지 못했습니다. localhost 또는 HTTPS에서 열고, 처음에는 온라인 상태에서 자료를 불러와 주세요. ${error.message || error}`;
      status.classList.add("error");
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("vaca-card-library", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("decks", { keyPath: "id" });
        store.createIndex("normalizedName", "normalizedName", { unique: true });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error("로컬 자료 저장소를 열지 못했습니다."));
      request.onblocked = () => reject(new Error("다른 탭에서 자료 저장소를 사용 중입니다. 다른 탭을 닫아 주세요."));
    });
  }

  function getAllDecks() {
    return new Promise((resolve, reject) => {
      const request = db.transaction("decks", "readonly").objectStore("decks").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("자료를 읽지 못했습니다."));
    });
  }

  function replaceDecks(items) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("decks", "readwrite");
      const store = transaction.objectStore("decks");
      for (const deck of items) store.put(deck);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("자료를 로컬에 저장하지 못했습니다."));
      transaction.onabort = () => reject(transaction.error || new Error("자료 저장이 취소되었습니다."));
    });
  }

  async function loadPublishedDecks() {
    const url = new URL("decks.json", document.baseURI);
    const response = await fetch(url.href, { cache: "no-cache" });
    if (!response.ok) throw new Error(`decks.json 요청에 실패했습니다 (HTTP ${response.status}).`);
    const payload = await response.json();
    if (!Array.isArray(payload.decks)) throw new Error("decks.json에 자료 목록이 없습니다.");
    return payload.decks;
  }

  function renderDays() {
    const list = page.querySelector(".mobile-list");
    list.replaceChildren();
    const sortedDecks = [...decks].sort((first, second) =>
      first.name.localeCompare(second.name, "ko", { numeric: true, sensitivity: "base" })
    );
    if (!sortedDecks.length) {
      list.append(makeEmpty("등록된 DAY 자료가 없습니다."));
      return;
    }
    for (const deck of sortedDecks) {
      const link = document.createElement("a");
      link.className = "mobile-day";
      link.href = `mobile_words.html?deckId=${encodeURIComponent(deck.id)}`;
      const name = document.createElement("strong");
      name.textContent = deck.name;
      const count = document.createElement("small");
      count.textContent = `${deck.cards.length}개 단어 →`;
      link.append(name, count);
      list.append(link);
    }
  }

  function renderWords() {
    const list = page.querySelector(".mobile-list");
    list.replaceChildren();
    list.classList.toggle("is-both-view", wordListViewMode === "both");
    page.querySelector('[data-action="show-both"]').setAttribute("aria-pressed", String(wordListViewMode === "both"));
    page.querySelector('[data-action="reset-word"]').setAttribute("aria-pressed", String(wordListViewMode === "word"));
    page.querySelector('[data-action="reset-meaning"]').setAttribute("aria-pressed", String(wordListViewMode === "meaning"));
    const query = new URLSearchParams({ deckId: activeDeck.id });
    page.querySelector('[data-action="memorize"]').href = `mobile_cards_type.html?${query.toString()}`;
    page.querySelector('[data-action="show-both"]').onclick = () => resetWordCards("both");
    page.querySelector('[data-action="reset-word"]').onclick = () => resetWordCards("word");
    page.querySelector('[data-action="reset-meaning"]').onclick = () => resetWordCards("meaning");
    if (!cards.length) {
      list.append(makeEmpty("이 DAY에 등록된 단어가 없습니다."));
      return;
    }
    cards.forEach((card, index) => {
      const item = document.createElement("article");
      item.className = "mobile-word";
      item.dataset.cardId = card.id;
      const favorite = document.createElement("button");
      favorite.type = "button";
      favorite.className = "mobile-word-star-button";
      favorite.textContent = card.favorite ? "★" : "☆";
      favorite.setAttribute("aria-label", card.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가");
      favorite.setAttribute("aria-pressed", String(Boolean(card.favorite)));
      if (wordListViewMode === "both") {
        item.classList.add("mobile-word-both");
        item.append(favorite, createBothViewContent(card));
        favorite.addEventListener("click", () => void toggleFavorite(card));
        list.append(item);
        return;
      }
      const front = document.createElement("span");
      front.className = "mobile-word-label";
      front.textContent = card.front;
      const frontFace = document.createElement("div");
      frontFace.className = "mobile-word-front";
      frontFace.append(front);

      const backFace = document.createElement("div");
      backFace.className = "mobile-word-back";
      appendMeanings(backFace, card, "mobile-sense");
      const flipper = document.createElement("div");
      flipper.className = "mobile-word-flipper";
      flipper.tabIndex = 0;
      flipper.setAttribute("role", "button");
      flipper.setAttribute("aria-pressed", String(wordListViewMode === "meaning"));
      flipper.setAttribute("aria-label", `${card.front} ${wordListViewMode === "meaning" ? "뜻 보기" : "영어 단어 보기"}`);
      flipper.append(frontFace, backFace);
      item.append(favorite, flipper);
      item.classList.toggle("is-meaning-front", wordListViewMode === "meaning");
      const toggle = () => {
        const flipped = item.classList.toggle("is-flipped");
        const meaningVisible = wordListViewMode === "meaning" ? !flipped : flipped;
        flipper.setAttribute("aria-pressed", String(meaningVisible));
        flipper.setAttribute("aria-label", `${card.front} ${meaningVisible ? "뜻 보기" : "영어 단어 보기"}`);
      };
      flipper.addEventListener("click", toggle);
      flipper.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });
      favorite.addEventListener("click", () => void toggleFavorite(card));
      list.append(item);
    });
  }

  function resetWordCards(mode) {
    wordListViewMode = mode;
    renderWords();
  }

  function createBothViewContent(card) {
    const content = document.createElement("div");
    content.className = "mobile-word-both-content";
    const word = document.createElement("strong");
    word.className = "mobile-word-both-label";
    word.textContent = card.front;
    const meanings = document.createElement("div");
    meanings.className = "mobile-word-both-meanings";
    for (const [index, meaning] of card.meanings.entries()) {
      const sense = document.createElement("div");
      sense.className = "mobile-word-both-sense";
      const text = document.createElement("strong");
      const numbering = card.meanings.length > 1 ? `${index + 1}. ` : "";
      text.textContent = `${numbering}${formatPartOfSpeech(meaning.partOfSpeech ?? card.partOfSpeech)}${meaning.text ? ` ${meaning.text}` : ""}`;
      sense.append(text);
      if (meaning.synonyms?.length) {
        const synonyms = document.createElement("span");
        synonyms.className = "mobile-word-both-synonyms";
        synonyms.textContent = `유사어: ${meaning.synonyms.join(", ")}`;
        sense.append(synonyms);
      }
      meanings.append(sense);
    }
    content.append(word, meanings);
    return content;
  }

  function renderCardType() {
    page.querySelectorAll(".mobile-mode-list [data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const query = new URLSearchParams({
          deckId: activeDeck.id,
          mode: button.dataset.mode
        });
        location.href = `mobile_cards.html?${query}`;
      });
    });
  }

  function renderCard() {
    const stage = page.querySelector(".mobile-card-stage");
    const controls = page.querySelector(".mobile-card-controls");
    if (!cards.length) {
      stage.hidden = true;
      controls.hidden = true;
      status.hidden = false;
      status.textContent = favoritesOnly
        ? "즐겨찾기한 단어가 없습니다. 단어 목록에서 별표를 설정해 주세요."
        : "이 자료에 학습할 단어가 없습니다.";
      return;
    }
    stage.hidden = false;
    controls.hidden = false;
    status.hidden = true;

    const card = cards[cardIndex];
    const cardElement = page.querySelector(".mobile-flashcard");
    const front = page.querySelector(".mobile-card-front");
    const back = page.querySelector(".mobile-card-back");
    const position = page.querySelector(".mobile-card-position");
    const previous = page.querySelector('[data-action="previous"]');
    const next = page.querySelector('[data-action="next"]');
    const audio = page.querySelector('[data-action="audio"]');
    const favoritesFilter = page.querySelector('[data-action="toggle-favorites"]');
    const favoriteIndicator = page.querySelector(".mobile-card-favorite-indicator");

    cardElement.classList.remove("is-flipped");
    cardElement.setAttribute("aria-pressed", "false");
    cardElement.setAttribute("aria-label", "뜻 보기");
    front.replaceChildren();
    front.classList.toggle("is-meaning-prompt", presentationMode === "meaning");
    back.replaceChildren();
    back.setAttribute("aria-hidden", "true");
    if (presentationMode === "meaning") {
      appendMeanings(front, card, "mobile-card-prompt-sense", false);
      const answer = document.createElement("strong");
      answer.className = "mobile-card-answer";
      answer.textContent = card.front;
      const answerMeanings = document.createElement("div");
      answerMeanings.className = "mobile-card-answer-meanings";
      appendMeanings(answerMeanings, card, "mobile-card-sense");
      back.append(answer, answerMeanings);
    } else {
      front.textContent = card.front;
      appendMeanings(back, card, "mobile-card-sense");
    }
    position.textContent = `${favoritesOnly ? "즐겨찾기만 · " : ""}${cardIndex + 1} / ${cards.length}`;
    previous.disabled = cardIndex === 0;
    next.disabled = cardIndex === cards.length - 1;
    audio.disabled = !card.audioUrl;
    favoritesFilter.textContent = favoritesOnly ? "전체 단어 보기" : "☆ 즐겨찾기만 보기";
    favoritesFilter.setAttribute("aria-pressed", String(favoritesOnly));
    favoriteIndicator.textContent = card.favorite ? "★" : "☆";
    favoriteIndicator.setAttribute("aria-pressed", String(Boolean(card.favorite)));
    favoriteIndicator.setAttribute("aria-label", card.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가");
    cardElement.onclick = (event) => {
      if (event.target.closest("button")) return;
      flipCard();
    };
    cardElement.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        flipCard();
      }
    };
    previous.onclick = () => moveCard(-1);
    next.onclick = () => moveCard(1);
    audio.onclick = () => playAudio(card);
    favoriteIndicator.onclick = () => void toggleFavorite(card);
    favoritesFilter.onclick = () => {
      favoritesOnly = !favoritesOnly;
      cards = favoritesOnly ? allCards.filter((item) => item.favorite) : allCards;
      cardIndex = 0;
      renderCard();
    };
  }

  async function toggleFavorite(card) {
    try {
      const updatedDeck = await updateStoredFavorite(activeDeck.id, card.id);
      activeDeck.updatedAt = updatedDeck.updatedAt;
      const updatedCard = updatedDeck.cards.find((item) => item.id === card.id);
      if (!updatedCard) throw new Error("저장된 단어를 다시 확인할 수 없습니다.");
      card.favorite = updatedCard.favorite;
      for (const storedCard of activeDeck.cards) {
        if (storedCard.id === card.id) storedCard.favorite = updatedCard.favorite;
      }
      if (favoritesOnly) {
        cards = allCards.filter((item) => item.favorite);
        cardIndex = Math.min(cardIndex, cards.length - 1);
      }
      if (page.dataset.mobilePage === "cards") renderCard();
      else {
        const favorite = page.querySelector(`.mobile-word[data-card-id="${CSS.escape(card.id)}"] .mobile-word-star-button`);
        if (favorite) {
          favorite.textContent = card.favorite ? "★" : "☆";
          favorite.setAttribute("aria-pressed", String(Boolean(card.favorite)));
          favorite.setAttribute("aria-label", card.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가");
        }
      }
      status.hidden = true;
      status.classList.remove("error");
    } catch (error) {
      status.textContent = `즐겨찾기를 저장하지 못했습니다. ${error.message || error}`;
      status.classList.add("error");
      status.hidden = false;
    }
  }

  function updateStoredFavorite(targetDeckId, targetCardId) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("decks", "readwrite");
      const store = transaction.objectStore("decks");
      const request = store.get(targetDeckId);
      let updatedDeck;
      let failure;
      request.onsuccess = () => {
        try {
          updatedDeck = request.result;
          if (!updatedDeck) throw new Error("자료를 찾지 못했습니다.");
          const storedCard = updatedDeck.cards.find((item) => item.id === targetCardId);
          if (!storedCard) throw new Error("단어를 찾지 못했습니다.");
          storedCard.favorite = !storedCard.favorite;
          updatedDeck.updatedAt = new Date().toISOString();
          store.put(updatedDeck);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      request.onerror = () => {
        failure = request.error || new Error("자료를 읽지 못했습니다.");
      };
      transaction.oncomplete = () => resolve(updatedDeck);
      transaction.onerror = () => {
        reject(failure || transaction.error || new Error("자료 저장에 실패했습니다."));
      };
      transaction.onabort = () => {
        reject(failure || transaction.error || new Error("자료 저장이 취소되었습니다."));
      };
    });
  }

  function appendMeanings(container, card, className, showSynonyms = true) {
    for (const [index, meaning] of card.meanings.entries()) {
      const sense = document.createElement("div");
      const prompt = className === "mobile-card-prompt-sense";
      sense.className = className;
      const text = document.createElement("strong");
      if (prompt) text.className = "mobile-card-prompt-text";
      const numberedMeaning = card.meanings.length > 1 &&
        (prompt || className === "mobile-sense" || className === "mobile-card-sense");
      const numbering = numberedMeaning ? `${index + 1}. ` : "";
      text.textContent = `${numbering}${formatPartOfSpeech(meaning.partOfSpeech ?? card.partOfSpeech)}${meaning.text ? ` ${meaning.text}` : ""}`;
      sense.append(text);
      if (showSynonyms && meaning.synonyms?.length) {
        const synonyms = document.createElement("span");
        synonyms.className = "mobile-synonyms";
        synonyms.textContent = `유사어: ${meaning.synonyms.join(", ")}`;
        sense.append(synonyms);
      }
      container.append(sense);
    }
  }

  function flipCard() {
    const cardElement = page.querySelector(".mobile-flashcard");
    const flipped = !cardElement.classList.contains("is-flipped");
    cardElement.classList.toggle("is-flipped", flipped);
    cardElement.setAttribute("aria-pressed", String(flipped));
    cardElement.setAttribute("aria-label", flipped ? "앞면 보기" : "뜻 보기");
    page.querySelector(".mobile-card-back").setAttribute("aria-hidden", String(!flipped));
  }

  function moveCard(offset) {
    cardIndex = Math.max(0, Math.min(cards.length - 1, cardIndex + offset));
    renderCard();
  }

  async function playAudio(card) {
    if (!card.audioUrl) return;
    try {
      const audio = new Audio(card.audioUrl);
      await audio.play();
    } catch (error) {
      status.hidden = false;
      status.textContent = `발음을 재생하지 못했습니다. 인터넷 연결과 오디오 주소를 확인해 주세요. ${error.message || error}`;
      status.classList.add("error");
    }
  }

  function formatPartOfSpeech(value) {
    const labels = {
      명사: "명", 동사: "동", 형용사: "형", 부사: "부",
      전치사: "전", 접속사: "접", 대명사: "대", 감탄사: "감"
    };
    const part = String(value || "").trim();
    return part ? `[${labels[part] || part}]` : "";
  }

  function makeEmpty(text) {
    const empty = document.createElement("p");
    empty.className = "mobile-empty";
    empty.textContent = text;
    return empty;
  }
})();
