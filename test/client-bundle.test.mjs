import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

/** Load lib/client.js in a fake browser + fake module loader. */
function loadClientBundle() {
  let registered = null
  const elements = []
  const styleElement = () => ({
    id: '',
    textContent: '',
    remove() {
      const index = elements.indexOf(this)
      if (index >= 0) elements.splice(index, 1)
    },
  })
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(definition) {
          registered = definition
        },
      },
    },
    document: {
      getElementById: () => null,
      createElement: () => {
        const element = styleElement()
        elements.push(element)
        return element
      },
      head: { appendChild() {} },
    },
    fetch: async () => ({ ok: false }),
    setTimeout,
    clearTimeout,
    console,
  }
  vm.createContext(sandbox)
  const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  vm.runInContext(source, sandbox)
  return { registered, elements }
}

test('client bundle registers the expected lazy-CJS factory', () => {
  const { registered } = loadClientBundle()
  assert.ok(registered, 'bundle should call window.__ModuleLoader__.load')
  assert.equal(registered.id, 'dsh-quality-lens')
  assert.equal(typeof registered.factory, 'function')
})

test('client plugin exports a Cordis plugin and registers the action-row chip', () => {
  const { registered, elements } = loadClientBundle()
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (value) => [value, () => {}],
    useEffect: () => {},
    Fragment: Symbol('Fragment'),
  }
  const plugin = registered.factory((name) => {
    if (name === 'react') return React
    throw new Error(`unexpected client module: ${name}`)
  })

  assert.equal(plugin.name, 'quality-lens')
  assert.deepEqual([...plugin.inject], ['slots', 'locale'])
  assert.equal(typeof plugin.apply, 'function')

  const registrations = []
  const ctx = {
    effect(fn) {
      return fn()
    },
    locale: { register: () => () => {} },
    slots: {
      inject(name, callback) {
        callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }

  plugin.apply(ctx)

  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.name, 'conversation.chat.assistant-actions')
  assert.equal(registrations[0].options.id, 'quality-lens')
  assert.equal(registrations[0].options.locale, 'quality-lens')
  assert.equal(typeof registrations[0].component, 'function')
  assert.ok(elements.length >= 1, 'the bundle should inject its scoped stylesheet once')
})
