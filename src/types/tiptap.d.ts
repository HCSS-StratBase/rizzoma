declare module '@tiptap/core' {
  export interface Commands<ReturnType = any> {
    [command: string]: (...args: any[]) => ReturnType;
  }

  export type Attributes = Record<string, any>;
  export type HTMLAttributes = Record<string, any>;

  export interface EditorCommands {
    setContent: (...args: any[]) => any;
    setTextSelection: (...args: any[]) => any;
    clearNodes: (...args: any[]) => any;
    unsetAllMarks: (...args: any[]) => any;
    [command: string]: (...args: any[]) => any;
  }

  export interface Editor {
    chain(): any;
    can(): any;
    isActive(name: string, attrs?: Attributes): boolean;
    on(event: string, callback: (...args: any[]) => void): void;
    off(event: string, callback: (...args: any[]) => void): void;
    commands: EditorCommands;
    state: {
      doc: any;
      selection: { from: number; to: number };
      plugins: any[];
    };
    view: {
      state: any;
      updateState: (state: any) => void;
      dispatch: (tr: any) => void;
    };
    isEditable: boolean;
    getHTML(): string;
    getText(): string;
    setEditable(editable: boolean): void;
  }

  export class Extension {
    static create(options: any): any;
  }

  export class Node {
    static create<T = any>(config: any): T;
  }

  export class Mark {
    static create<T = any>(config: any): T;
  }
}
