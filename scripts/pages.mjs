class LineagePages extends Application {
  static MODULE = "lineage-pages";

  /* -------------------------------------- */
  /*                                        */
  /*               OVERRIDES                */
  /*                                        */
  /* -------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "lineage-pages",
      classes: ["lineage-pages"],
      tabs: [],
      scrollY: [],
      title: "LINEAGE_PAGES.LineagePages",
      template: "modules/lineage-pages/templates/pages.hbs",
      resizable: true,
      height: 800,
      width: 500,
      left: 150,
      initial: null // The current lineage page.
    });
  }

  /** @override */
  _restoreScrollPositions(html) {
    super._restoreScrollPositions(html);
    html[0].querySelector(".lineage-nav img.active")?.scrollIntoView({inline: "center"});
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html[0].querySelectorAll(".lineage-nav button[data-action]").forEach(n => {
      n.addEventListener("click", this._onClickDirection.bind(this));
    });
    html[0].querySelectorAll(".lineage-nav img[data-action]").forEach(n => {
      n.addEventListener("click", this._onClickLineage.bind(this));
    });

    const debouncedScroll = foundry.utils.debounce(this._onGalleryScroll, 50);
    html[0].querySelector(".lineage-nav .gallery").addEventListener("wheel", debouncedScroll.bind(this));
  }

  /** @override */
  async getData(options = {}) {
    const items = await this.getItems();
    const item = items.find(item => item.uuid === options.initial) ?? items[0];
    if (!item) return {};
    const backdrops = game.settings.get(LineagePages.MODULE, "backdrops") ?? {};
    return {
      items: items,
      item: item,
      text: await this.getEnrichedDescription(item),
      backdrop: backdrops[item.id] ?? null
    };
  }

  /**
   * Get race items available to present in the pages.
   * @returns {Promise<Item5e[]>}     All race items.
   */
  static async getItems() {
    const keys = game.settings.get(LineagePages.MODULE, "packs") ?? [];
    const packs = keys.reduce((acc, key) => {
      const pack = game.packs.get(key);
      if (pack) acc.push(pack);
      return acc;
    }, []);
    const promises = packs.map(pack => pack.getDocuments({type: "race"}));
    const items = (await Promise.all(promises)).flat(1);
    return items;
  }
  async getItems() {
    return this.constructor.getItems();
  }

  /**
   * Utility function to batch construct and enrich an index entry.
   * @param {Item5e} item           A race item.
   * @returns {Promise<string>}     Enriched text.
   */
  async getEnrichedDescription(item) {
    return TextEditor.enrichHTML(item.system.description.value, {async: true});
  }

  /** @override */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    if (game.user.isGM) {
      buttons.unshift({
        class: "lineage-pages-configuration",
        icon: "fa-solid fa-cog",
        onclick: () => new LineagePagesDialog(this.lineages, this).render(true),
        label: "SETTINGS.Configure"
      });
    }
    return buttons;
  }

  /* -------------------------------------- */
  /*                                        */
  /*             EVENT HANDLERS             */
  /*                                        */
  /* -------------------------------------- */

  /**
   * Handle the scroll event for the lineage icons gallery.
   * @param {WheelEvent} event      The scroll event.
   * @returns {Promise<LineagePages|null>}
   */
  async _onGalleryScroll(event) {
    const activeIcon = this.element[0].querySelector(".lineage-nav .gallery img.active");
    if (!activeIcon) return null;
    const direction = Math.sign(event.deltaY);
    const [first, last] = activeIcon.parentNode.querySelectorAll("img:first-child, img:last-child");
    let nextIcon = null;
    if (direction > 0) nextIcon = activeIcon.nextElementSibling || first;
    else nextIcon = activeIcon.previousElementSibling || last;
    return nextIcon ? this.renderPage(nextIcon.dataset.uuid) : null;
  }

  /**
   * Render the page based on the item uuid.
   * @param {string} uuid               Uuid of the race item.
   * @returns {Promise<LineagePages>}
   */
  async renderPage(uuid) {
    return this.render(false, {initial: uuid});
  }

  /**
   * Handle clicking a specific race item in the top navigation.
   * @param {PointerEvent} event      The initiating click event.
   * @returns {Promise<LineagePages>}
   */
  async _onClickLineage(event) {
    return this.renderPage(event.currentTarget.dataset.uuid);
  }

  /**
   * Handle clicking a directional button on the main tab navigation.
   * @param {PointerEvent} event      The initiating click event.
   * @returns {Promise<LineagePages|null>}
   */
  async _onClickDirection(event) {
    const action = event.currentTarget.dataset.action;
    const nav = event.currentTarget.closest(".lineage-nav");
    const first = nav.querySelector("img:first-child");
    const last = nav.querySelector("img:last-child");
    const curr = nav.querySelector("img.active");
    if (!curr) return null;
    let next;
    if (action === "left") {
      next = curr.previousElementSibling ?? last;
    } else {
      next = curr.nextElementSibling ?? first;
    }
    return this.renderPage(next.dataset.uuid);
  }

  /* -------------------------------------- */
  /*                                        */
  /*             STATIC METHODS             */
  /*                                        */
  /* -------------------------------------- */

  /**
   * Render this application.
   * @param {string} [initial=null]       Uuid of the specific item whose page to render.
   * @returns {Promise<LineagePages>}     The rendered application.
   */
  static async show(initial = null) {
    const active = Object.values(ui.windows).find(w => w instanceof LineagePages);
    if (active) return active.render(false, {initial: initial});
    return new LineagePages().render(true, {initial: initial});
  }

  /** Initialize the module. */
  static init() {
    Hooks.on("getSceneControlButtons", (array) => {
      const token = array.find(a => a.name === "token");
      // Render the class page.
      token.tools.push({
        name: "lineage-page",
        title: "LINEAGE_PAGES.LineagePages",
        icon: "fa-solid fa-dna",
        button: true,
        visible: true,
        onClick: () => {
          const uuid = game.user.character?.system?.details?.race?.flags?.core?.sourceId ?? null;
          return LineagePages.show(uuid);
        }
      });
    });

    game.modules.get(LineagePages.MODULE).api = {
      show: LineagePages.show
    };

    game.settings.register(LineagePages.MODULE, "packs", {
      scope: "world", config: false, type: Array, default: []
    });

    game.settings.register(LineagePages.MODULE, "backdrops", {
      scope: "world", config: false, type: Object, default: {}
    });
  }
}

/* Utility dialog for rendering subapplications; source config and art config. */
class LineagePagesDialog extends Application {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "lineage-pages-dialog",
      width: 400,
      height: "auto",
      template: "modules/lineage-pages/templates/settings-prompt.hbs",
      title: "SETTINGS.Configure",
      classes: ["lineage-pages-dialog"]
    });
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html[0].querySelectorAll("[data-action]").forEach(n => {
      const action = n.dataset.action;
      if (action === "packs") n.addEventListener("click", this._onClickPacks.bind(this));
      else if (action === "art") n.addEventListener("click", this._onClickArt.bind(this));
    });
  }

  /* -------------------- */
  /* Click event handlers */
  /* -------------------- */

  _onClickPacks(event) {
    new LineagePagesPackSettings().render(true);
    this.close();
  }

  _onClickArt(event) {
    new LineagePagesArtSettings().render(true);
    this.close();
  }
}

/* Utility class for configuring compendium keys. */
class LineagePagesPackSettings extends FormApplication {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "modules/lineage-pages/templates/pack-settings.hbs",
      classes: ["lineage-pages-pack-settings"],
      title: "LINEAGE_PAGES.SettingsPacksTitle",
      width: 400,
      height: "auto",
      id: "lineage-pages-pack-settings"
    });
  }

  /** @override */
  async getData() {
    return {
      model: this.model ??= new this.constructor._model({
        packs: game.settings.get(LineagePages.MODULE, "packs") ?? []
      }),
      selectOptions: game.packs.reduce((acc, pack) => {
        if (pack.metadata.type === "Item") acc[pack.metadata.id] = pack.metadata.label;
        return acc;
      }, {})
    };
  }

  /** @override */
  async _updateObject() {
    const data = this.model.toObject();
    this.close();
    await game.settings.set(LineagePages.MODULE, "packs", data.packs.filter(u => u));
    Object.values(ui.windows).find(e => e instanceof LineagePages)?.render();
  }

  /** @override */
  async _onChangeInput(event) {
    const data = new FormDataExtended(this.form).object;
    if (typeof data.packs === "string") data.packs = [data.packs];
    data.packs = data.packs.filter(u => u);
    this.model.updateSource(data);
    this.render();
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html[0].querySelectorAll("[data-action=delete]").forEach(n => {
      n.addEventListener("click", this._onDelete.bind(this));
    });
  }

  /**
   * Delete a form group.
   * @param {PointerEvent} event
   */
  async _onDelete(event) {
    event.currentTarget.closest(".form-group").remove();
    return this._onChangeInput(event);
  }

  /**
   * A data model instance.
   * @type {DataModel}
   */
  static get _model() {
    return class ClassPageSettingsModel extends foundry.abstract.DataModel {
      static defineSchema() {
        return {
          packs: new foundry.data.fields.SetField(new foundry.data.fields.StringField())
        };
      }
    };
  }
}

/* Utility class for configuring class backdrops and subclass labels. */
class LineagePagesArtSettings extends FormApplication {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "modules/lineage-pages/templates/art-settings.hbs",
      classes: ["lineage-pages-art-settings"],
      title: "LINEAGE_PAGES.SettingsArtTitle",
      width: 500,
      height: "auto",
      id: "lineage-pages-art-settings"
    });
  }

  /** @override */
  async getData() {
    const backdrops = game.settings.get(LineagePages.MODULE, "backdrops") ?? {};
    const items = await LineagePages.getItems();
    return {
      items: items.map(item => {
        return {
          item: item,
          backdrop: backdrops[item.id] || null
        };
      })
    };
  }

  /** @override */
  async _updateObject(event, data = {}) {
    for (const [key, val] of Object.entries(data)) if (!val) data[key] = null;
    await game.settings.set(LineagePages.MODULE, "backdrops", data);
    Object.values(ui.windows).find(e => e instanceof LineagePages)?.render();
  }
}

Hooks.once("init", LineagePages.init);
