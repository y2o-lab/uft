export async function mountAtRoute<Canvas>(
  path: string,
  mount: () => Promise<Canvas>,
): Promise<Canvas> {
  const { href, search, hash } = window.location;
  const state = window.history.state;
  window.history.replaceState(state, "", `${path}${search}${hash}`);

  try {
    return await mount();
  } finally {
    window.history.replaceState(state, "", href);
  }
}
