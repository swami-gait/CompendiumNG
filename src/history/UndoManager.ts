// ============================================================
// CompendiumNG Web — Undo/Redo (Command Pattern)
// ============================================================

import { generateId } from '../core/utils';

export interface Command {
  id: string;
  description: string;
  execute(): Promise<void>;
  undo(): Promise<void>;
}

const MAX_HISTORY = 100;

class UndoManagerClass {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners: Array<() => void> = [];

  async execute(cmd: Command): Promise<void> {
    await cmd.execute();
    this.undoStack.push(cmd);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.notify();
  }

  async undo(): Promise<void> {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    await cmd.undo();
    this.redoStack.push(cmd);
    this.notify();
  }

  async redo(): Promise<void> {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    await cmd.execute();
    this.undoStack.push(cmd);
    this.notify();
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoLabel(): string { return this.undoStack[this.undoStack.length - 1]?.description ?? ''; }
  get redoLabel(): string { return this.redoStack[this.redoStack.length - 1]?.description ?? ''; }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

export const UndoManager = new UndoManagerClass();

// --------------- Command Factories ---------------

/** Helper to create a command object */
export function makeCommand(
  description: string,
  exec: () => Promise<void>,
  undoFn: () => Promise<void>
): Command {
  return { id: generateId(), description, execute: exec, undo: undoFn };
}
