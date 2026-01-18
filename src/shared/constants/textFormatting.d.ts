export declare const TextLevelParams: {
    readonly BOLD: "T_BOLD";
    readonly ITALIC: "T_ITALIC";
    readonly STRUCKTHROUGH: "T_STRUCKTHROUGH";
    readonly UNDERLINED: "T_UNDERLINED";
    readonly BG_COLOR: "T_BG_COLOR";
    readonly URL: "T_URL";
};
export declare const LineLevelParams: {
    readonly BULLETED: "L_BULLETED";
    readonly NUMBERED: "L_NUMBERED";
};
export declare const ModelType: {
    readonly TEXT: "TEXT";
    readonly LINE: "LINE";
    readonly ATTACHMENT: "ATTACHMENT";
    readonly RECIPIENT: "RECIPIENT";
    readonly TASK_RECIPIENT: "TASK_RECIPIENT";
    readonly GADGET: "GADGET";
    readonly FILE: "FILE";
    readonly TAG: "TAG";
    readonly BLIP: "BLIP";
};
export interface TextFormattingOptions {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    backgroundColor?: string;
    url?: string;
    bulletList?: boolean;
    numberedList?: boolean;
}
export declare const GadgetTypes: {
    readonly IMAGE: "image";
    readonly VIDEO: "video";
    readonly MAP: "map";
    readonly POLL: "poll";
    readonly EMBED: "embed";
};
export declare const DEFAULT_BG_COLORS: readonly ["#ffffff", "#ffd93d", "#6bcf7f", "#6495ed", "#e78284", "#ba8cff", "#ff9a56", "#c0c0c0"];
//# sourceMappingURL=textFormatting.d.ts.map