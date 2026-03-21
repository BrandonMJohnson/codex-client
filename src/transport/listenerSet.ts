export class ListenerSet<TListener extends (...args: never[]) => void> {
  readonly #listeners = new Set<TListener>();

  public add(listener: TListener): () => void {
    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  public notify(...args: Parameters<TListener>): void {
    for (const listener of this.#listeners) {
      listener(...args);
    }
  }

  public clear(): void {
    this.#listeners.clear();
  }
}
