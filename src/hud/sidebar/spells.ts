import {
    ActorPF2e,
    addListenerAll,
    changeCarryType,
    coerceToSpellGroupId,
    CreaturePF2e,
    elementDataset,
    ErrorPF2e,
    getActiveModule,
    getSummarizedSpellsDataForRender,
    htmlClosest,
    isValidClickEvent,
    ItemPF2e,
    OneToTen,
    SummarizedSpellsData,
} from "module-helpers";
import {
    getAnnotationTooltip,
    PF2eHudSidebar,
    SidebarContext,
    SidebarName,
    SidebarRenderOptions,
} from "./base";

class PF2eHudSidebarSpells extends PF2eHudSidebar {
    get key(): SidebarName {
        return "spells";
    }

    async _prepareContext(options: SidebarRenderOptions): Promise<SpellsContext> {
        const parentData = await super._prepareContext(options);
        const summarizedData = await getSummarizedSpellsDataForRender(this.actor, false);

        const filterValues = summarizedData.spells.map((spells) =>
            spells.map((spell) => spell.name).join("|")
        );

        const data: SpellsContext = {
            ...parentData,
            ...summarizedData,
            filterValues,
            annotationTooltip: getAnnotationTooltip,
        };

        return data;
    }

    _getDragData(
        target: HTMLElement,
        baseDragData: Record<string, JSONValue>,
        item: Maybe<ItemPF2e<ActorPF2e>>
    ) {
        return target.dataset;
    }

    getSpellFromElement(target: HTMLElement) {
        const spellRow = htmlClosest(target, "[data-item-id]");
        const { itemId, entryId, slotId } = spellRow?.dataset ?? {};
        const collection = this.actor.spellcasting.collections.get(entryId, {
            strict: true,
        });

        return {
            slotId,
            collection,
            castRank: spellRow?.dataset.castRank,
            spell: collection.get(itemId, { strict: true }),
        };
    }

    _activateListeners(html: HTMLElement) {
        const actor = this.actor;
        const isCharacter = actor.isOfType("character");

        if (isCharacter || actor.isOfType("npc")) {
            addListenerAll(html, "[data-slider-action='focus']", "mousedown", (event, el) => {
                if (!isValidClickEvent(event)) return;

                const direction = event.button === 0 ? 1 : -1;
                const focusPoints = actor.system.resources.focus;
                const newValue = Math.clamp(focusPoints.value + direction, 0, focusPoints.max);

                if (newValue !== focusPoints.value) {
                    actor.update({ "system.resources.focus.value": newValue });
                }
            });
        }

        if (isCharacter) {
            const pf2eDailies = getActiveModule("pf2e-dailies");
            if (pf2eDailies) {
                addListenerAll(
                    html,
                    "[data-action='update-staff-charges']",
                    "change",
                    (event, el: HTMLInputElement) => {
                        const value = el.valueAsNumber;
                        pf2eDailies.api.setStaffChargesValue(actor, value);
                    }
                );
            }
        }

        addListenerAll(html,
            "[data-item-id]",
            "mouseenter",
            (_, button) => {
                if (button.className.includes("option-toggle")) return;
                const spell = this.getSpellFromElement(button);
                hoverItem(this.actor.getActiveTokens()[0], spell.spell);
            });

        addListenerAll(html,
            "[data-item-id]",
            "mouseleave",
            (_, __) => {
                hoverItem(this.actor.getActiveTokens()[0], undefined);
            });

        addListenerAll(html, "[data-action]:not(disabled)", (event, el) => {
            const action = el.dataset.action as SpellsActionEvent;

            switch (action) {
                case "cast-spell": {
                    const { spell, castRank, collection, slotId } = this.getSpellFromElement(el);
                    const maybeCastRank = Number(castRank) || NaN;
                    if (!Number.isInteger(maybeCastRank) || !maybeCastRank.between(1, 10)) return;

                    const rank = maybeCastRank as OneToTen;
                    this.parentHUD.closeIf("cast-spell");

                    return (
                        spell.parentItem?.consume() ??
                        collection.entry.cast(spell, { rank, slotId: Number(slotId) })
                    );
                }

                case "toggle-slot-expended": {
                    const row = htmlClosest(el, "[data-item-id]");
                    const groupId = coerceToSpellGroupId(row?.dataset.groupId);
                    if (!groupId) throw ErrorPF2e("Unexpected error toggling expended state");

                    const slotId = Number(row?.dataset.slotId) || 0;
                    const entryId = row?.dataset.entryId ?? "";
                    const expend = row?.dataset.slotExpended === undefined;
                    const collection = actor.spellcasting.collections.get(entryId);

                    return collection?.setSlotExpendedState(groupId, slotId, expend);
                }

                case "draw-item": {
                    const { parentId, annotation } = elementDataset<SpellDrawData>(el);
                    const item = actor.inventory.get(parentId, { strict: true });
                    if (!item) return;
                    return changeCarryType(actor, item, 1, annotation);
                }

                case "toggle-signature": {
                    const { spell } = this.getSpellFromElement(el);
                    return spell.update({
                        "system.location.signature": !spell.system.location.signature,
                    });
                }
            }
        });
    }
}

async function hoverItem(token: Token<TokenDocument<Scene>>, item: SpellPF2e | null | undefined) {
    if(token === undefined) return;

    if (item === null || item === undefined) {
        TacticalGrid.clearRangeHighlight(token);
    } else {
        TacticalGrid.rangeHighlight(token, {item});
    }
}

type SpellDrawData = {
    parentId: string;
    annotation: NonNullable<AuxiliaryActionPurpose>;
};

type SpellsActionEvent = "cast-spell" | "toggle-slot-expended" | "draw-item" | "toggle-signature";

interface PF2eHudSidebarSpells {
    get actor(): CreaturePF2e;
}

type SpellsContext = SidebarContext &
    SummarizedSpellsData & {
        filterValues: string[];
        annotationTooltip: (annotation: NonNullable<AuxiliaryActionPurpose>) => string;
    };

export { getAnnotationTooltip, PF2eHudSidebarSpells };
