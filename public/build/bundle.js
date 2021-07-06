
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    // Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
    // at the end of hydration without touching the remaining nodes.
    let is_hydrating = false;
    function start_hydrating() {
        is_hydrating = true;
    }
    function end_hydrating() {
        is_hydrating = false;
    }
    function upper_bound(low, high, key, value) {
        // Return first index of value larger than input value in the range [low, high)
        while (low < high) {
            const mid = low + ((high - low) >> 1);
            if (key(mid) <= value) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    function init_hydrate(target) {
        if (target.hydrate_init)
            return;
        target.hydrate_init = true;
        // We know that all children have claim_order values since the unclaimed have been detached
        const children = target.childNodes;
        /*
        * Reorder claimed children optimally.
        * We can reorder claimed children optimally by finding the longest subsequence of
        * nodes that are already claimed in order and only moving the rest. The longest
        * subsequence subsequence of nodes that are claimed in order can be found by
        * computing the longest increasing subsequence of .claim_order values.
        *
        * This algorithm is optimal in generating the least amount of reorder operations
        * possible.
        *
        * Proof:
        * We know that, given a set of reordering operations, the nodes that do not move
        * always form an increasing subsequence, since they do not move among each other
        * meaning that they must be already ordered among each other. Thus, the maximal
        * set of nodes that do not move form a longest increasing subsequence.
        */
        // Compute longest increasing subsequence
        // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
        const m = new Int32Array(children.length + 1);
        // Predecessor indices + 1
        const p = new Int32Array(children.length);
        m[0] = -1;
        let longest = 0;
        for (let i = 0; i < children.length; i++) {
            const current = children[i].claim_order;
            // Find the largest subsequence length such that it ends in a value less than our current value
            // upper_bound returns first greater value, so we subtract one
            const seqLen = upper_bound(1, longest + 1, idx => children[m[idx]].claim_order, current) - 1;
            p[i] = m[seqLen] + 1;
            const newLen = seqLen + 1;
            // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
            m[newLen] = i;
            longest = Math.max(newLen, longest);
        }
        // The longest increasing subsequence of nodes (initially reversed)
        const lis = [];
        // The rest of the nodes, nodes that will be moved
        const toMove = [];
        let last = children.length - 1;
        for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
            lis.push(children[cur - 1]);
            for (; last >= cur; last--) {
                toMove.push(children[last]);
            }
            last--;
        }
        for (; last >= 0; last--) {
            toMove.push(children[last]);
        }
        lis.reverse();
        // We sort the nodes being moved to guarantee that their insertion order matches the claim order
        toMove.sort((a, b) => a.claim_order - b.claim_order);
        // Finally, we move the nodes
        for (let i = 0, j = 0; i < toMove.length; i++) {
            while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
                j++;
            }
            const anchor = j < lis.length ? lis[j] : null;
            target.insertBefore(toMove[i], anchor);
        }
    }
    function append(target, node) {
        if (is_hydrating) {
            init_hydrate(target);
            if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentElement !== target))) {
                target.actual_end_child = target.firstChild;
            }
            if (node !== target.actual_end_child) {
                target.insertBefore(node, target.actual_end_child);
            }
            else {
                target.actual_end_child = node.nextSibling;
            }
        }
        else if (node.parentNode !== target) {
            target.appendChild(node);
        }
    }
    function insert(target, node, anchor) {
        if (is_hydrating && !anchor) {
            append(target, node);
        }
        else if (node.parentNode !== target || (anchor && node.nextSibling !== anchor)) {
            target.insertBefore(node, anchor || null);
        }
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                start_hydrating();
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            end_hydrating();
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.38.3' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src\components\CharityList.svelte generated by Svelte v3.38.3 */

    const file$4 = "src\\components\\CharityList.svelte";

    function create_fragment$6(ctx) {
    	let section;
    	let div22;
    	let div1;
    	let div0;
    	let h2;
    	let t1;
    	let span0;
    	let t2;
    	let p0;
    	let t3;
    	let br;
    	let t4;
    	let t5;
    	let div21;
    	let div20;
    	let div11;
    	let div10;
    	let div9;
    	let div2;
    	let h5;
    	let t7;
    	let button0;
    	let span1;
    	let t9;
    	let div7;
    	let form;
    	let div3;
    	let label0;
    	let t11;
    	let input0;
    	let t12;
    	let div4;
    	let label1;
    	let t14;
    	let input1;
    	let t15;
    	let div5;
    	let label2;
    	let t17;
    	let input2;
    	let t18;
    	let div6;
    	let input3;
    	let t19;
    	let label3;
    	let t21;
    	let div8;
    	let button1;
    	let t23;
    	let div19;
    	let div14;
    	let img0;
    	let img0_src_value;
    	let t24;
    	let div13;
    	let div12;
    	let p1;
    	let span2;
    	let t26;
    	let t27;
    	let div18;
    	let ul0;
    	let li0;
    	let a0;
    	let t29;
    	let a1;
    	let t31;
    	let ul1;
    	let li1;
    	let t32;
    	let span3;
    	let t34;
    	let li2;
    	let span4;
    	let t36;
    	let span5;
    	let t38;
    	let li3;
    	let t39;
    	let span6;
    	let t41;
    	let span7;
    	let t42;
    	let div17;
    	let div15;
    	let img1;
    	let img1_src_value;
    	let t43;
    	let div16;
    	let a2;
    	let span8;
    	let t45;
    	let t46;
    	let span9;
    	let t47;
    	let a3;

    	const block = {
    		c: function create() {
    			section = element("section");
    			div22 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Popular Causes";
    			t1 = space();
    			span0 = element("span");
    			t2 = space();
    			p0 = element("p");
    			t3 = text("FundPress has built a platform focused on aiding entrepreneurs,\r\n          startups, and ");
    			br = element("br");
    			t4 = text(" companies raise capital from anyone.");
    			t5 = space();
    			div21 = element("div");
    			div20 = element("div");
    			div11 = element("div");
    			div10 = element("div");
    			div9 = element("div");
    			div2 = element("div");
    			h5 = element("h5");
    			h5.textContent = "Splash Drone 3 a Fully Waterproof Drone that floats";
    			t7 = space();
    			button0 = element("button");
    			span1 = element("span");
    			span1.textContent = "×";
    			t9 = space();
    			div7 = element("div");
    			form = element("form");
    			div3 = element("div");
    			label0 = element("label");
    			label0.textContent = "Amount donation";
    			t11 = space();
    			input0 = element("input");
    			t12 = space();
    			div4 = element("div");
    			label1 = element("label");
    			label1.textContent = "Your name";
    			t14 = space();
    			input1 = element("input");
    			t15 = space();
    			div5 = element("div");
    			label2 = element("label");
    			label2.textContent = "Email address";
    			t17 = space();
    			input2 = element("input");
    			t18 = space();
    			div6 = element("div");
    			input3 = element("input");
    			t19 = space();
    			label3 = element("label");
    			label3.textContent = "I Agree";
    			t21 = space();
    			div8 = element("div");
    			button1 = element("button");
    			button1.textContent = "Continue";
    			t23 = space();
    			div19 = element("div");
    			div14 = element("div");
    			img0 = element("img");
    			t24 = space();
    			div13 = element("div");
    			div12 = element("div");
    			p1 = element("p");
    			span2 = element("span");
    			span2.textContent = "0";
    			t26 = text("%");
    			t27 = space();
    			div18 = element("div");
    			ul0 = element("ul");
    			li0 = element("li");
    			a0 = element("a");
    			a0.textContent = "Food";
    			t29 = space();
    			a1 = element("a");
    			a1.textContent = "Splash Drone 3 a Fully Waterproof Drone that floats";
    			t31 = space();
    			ul1 = element("ul");
    			li1 = element("li");
    			t32 = text("$67,000");
    			span3 = element("span");
    			span3.textContent = "Pledged";
    			t34 = space();
    			li2 = element("li");
    			span4 = element("span");
    			span4.textContent = "0";
    			t36 = text("% ");
    			span5 = element("span");
    			span5.textContent = "Funded";
    			t38 = space();
    			li3 = element("li");
    			t39 = text("3");
    			span6 = element("span");
    			span6.textContent = "Days to go";
    			t41 = space();
    			span7 = element("span");
    			t42 = space();
    			div17 = element("div");
    			div15 = element("div");
    			img1 = element("img");
    			t43 = space();
    			div16 = element("div");
    			a2 = element("a");
    			span8 = element("span");
    			span8.textContent = "By";
    			t45 = text("Ema Watson");
    			t46 = space();
    			span9 = element("span");
    			t47 = space();
    			a3 = element("a");
    			a3.textContent = "Donate This Cause";
    			attr_dev(h2, "class", "xs-title");
    			add_location(h2, file$4, 5, 8, 229);
    			attr_dev(span0, "class", "xs-separetor dashed");
    			add_location(span0, file$4, 6, 8, 279);
    			add_location(br, file$4, 9, 24, 429);
    			add_location(p0, file$4, 7, 8, 325);
    			attr_dev(div0, "class", "col-md-9 col-xl-9");
    			add_location(div0, file$4, 4, 6, 188);
    			attr_dev(div1, "class", "xs-heading row xs-mb-60");
    			add_location(div1, file$4, 3, 4, 143);
    			attr_dev(h5, "class", "modal-title");
    			attr_dev(h5, "id", "exampleModalLabel");
    			add_location(h5, file$4, 30, 16, 1059);
    			attr_dev(span1, "aria-hidden", "true");
    			add_location(span1, file$4, 39, 18, 1408);
    			attr_dev(button0, "type", "button");
    			attr_dev(button0, "class", "close");
    			attr_dev(button0, "data-dismiss", "modal");
    			attr_dev(button0, "aria-label", "Close");
    			add_location(button0, file$4, 33, 16, 1218);
    			attr_dev(div2, "class", "modal-header");
    			add_location(div2, file$4, 29, 14, 1015);
    			attr_dev(label0, "for", "exampleInputAmount");
    			add_location(label0, file$4, 45, 20, 1626);
    			input0.required = true;
    			attr_dev(input0, "type", "number");
    			attr_dev(input0, "class", "form-control");
    			attr_dev(input0, "id", "exampleInputAmount");
    			attr_dev(input0, "aria-describedby", "amountHelp");
    			attr_dev(input0, "placeholder", "Enter amount");
    			add_location(input0, file$4, 46, 20, 1703);
    			attr_dev(div3, "class", "form-group");
    			add_location(div3, file$4, 44, 18, 1580);
    			attr_dev(label1, "for", "exampleInputName");
    			add_location(label1, file$4, 56, 20, 2088);
    			input1.required = true;
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "class", "form-control");
    			attr_dev(input1, "id", "exampleInputName");
    			attr_dev(input1, "aria-describedby", "nameHelp");
    			attr_dev(input1, "placeholder", "Enter full name");
    			add_location(input1, file$4, 57, 20, 2157);
    			attr_dev(div4, "class", "form-group");
    			add_location(div4, file$4, 55, 18, 2042);
    			attr_dev(label2, "for", "exampleInputEmail1");
    			add_location(label2, file$4, 67, 20, 2539);
    			input2.required = true;
    			attr_dev(input2, "type", "email");
    			attr_dev(input2, "class", "form-control");
    			attr_dev(input2, "id", "exampleInputEmail1");
    			attr_dev(input2, "aria-describedby", "emailHelp");
    			attr_dev(input2, "placeholder", "Enter email");
    			add_location(input2, file$4, 68, 20, 2614);
    			attr_dev(div5, "class", "form-group");
    			add_location(div5, file$4, 66, 18, 2493);
    			attr_dev(input3, "type", "checkbox");
    			attr_dev(input3, "class", "form-check-input");
    			attr_dev(input3, "id", "exampleCheck1");
    			add_location(input3, file$4, 78, 20, 2996);
    			attr_dev(label3, "class", "form-check-label");
    			attr_dev(label3, "for", "exampleCheck1");
    			add_location(label3, file$4, 83, 20, 3177);
    			attr_dev(div6, "class", "form-check");
    			add_location(div6, file$4, 77, 18, 2950);
    			add_location(form, file$4, 43, 16, 1554);
    			attr_dev(div7, "class", "modal-body");
    			add_location(div7, file$4, 42, 14, 1512);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "class", "btn btn-primary");
    			add_location(button1, file$4, 90, 16, 3423);
    			attr_dev(div8, "class", "modal-footer");
    			add_location(div8, file$4, 89, 14, 3379);
    			attr_dev(div9, "class", "modal-content");
    			add_location(div9, file$4, 28, 12, 972);
    			attr_dev(div10, "class", "modal-dialog");
    			attr_dev(div10, "role", "document");
    			add_location(div10, file$4, 27, 10, 916);
    			attr_dev(div11, "class", "modal fade");
    			attr_dev(div11, "id", "exampleModal");
    			attr_dev(div11, "tabindex", "-1");
    			attr_dev(div11, "role", "dialog");
    			attr_dev(div11, "aria-labelledby", "exampleModalLabel");
    			attr_dev(div11, "aria-hidden", "true");
    			add_location(div11, file$4, 19, 8, 703);
    			if (img0.src !== (img0_src_value = "assets/images/causes/causes_4.png")) attr_dev(img0, "src", img0_src_value);
    			attr_dev(img0, "alt", "");
    			add_location(img0, file$4, 97, 12, 3669);
    			attr_dev(span2, "class", "number-percentage-count number-percentage");
    			attr_dev(span2, "data-value", "90");
    			attr_dev(span2, "data-animation-duration", "3500");
    			add_location(span2, file$4, 102, 18, 3850);
    			add_location(p1, file$4, 101, 16, 3827);
    			attr_dev(div12, "class", "xs-skill-track");
    			add_location(div12, file$4, 100, 14, 3781);
    			attr_dev(div13, "class", "xs-skill-bar");
    			add_location(div13, file$4, 99, 12, 3739);
    			attr_dev(div14, "class", "xs-item-header");
    			add_location(div14, file$4, 96, 10, 3627);
    			attr_dev(a0, "href", "");
    			add_location(a0, file$4, 114, 18, 4277);
    			add_location(li0, file$4, 114, 14, 4273);
    			attr_dev(ul0, "class", "xs-simple-tag xs-mb-20");
    			add_location(ul0, file$4, 113, 12, 4222);
    			attr_dev(a1, "href", "#");
    			attr_dev(a1, "class", "xs-post-title xs-mb-30");
    			add_location(a1, file$4, 117, 12, 4336);
    			add_location(span3, file$4, 122, 25, 4540);
    			add_location(li1, file$4, 122, 14, 4529);
    			attr_dev(span4, "class", "number-percentage-count number-percentage");
    			attr_dev(span4, "data-value", "90");
    			attr_dev(span4, "data-animation-duration", "3500");
    			add_location(span4, file$4, 124, 16, 4603);
    			add_location(span5, file$4, 128, 19, 4791);
    			add_location(li2, file$4, 123, 14, 4581);
    			add_location(span6, file$4, 130, 19, 4852);
    			add_location(li3, file$4, 130, 14, 4847);
    			attr_dev(ul1, "class", "xs-list-with-content");
    			add_location(ul1, file$4, 121, 12, 4480);
    			attr_dev(span7, "class", "xs-separetor");
    			add_location(span7, file$4, 133, 12, 4915);
    			if (img1.src !== (img1_src_value = "assets/images/avatar/avatar_1.jpg")) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "alt", "");
    			add_location(img1, file$4, 137, 16, 5052);
    			attr_dev(div15, "class", "xs-round-avatar");
    			add_location(div15, file$4, 136, 14, 5005);
    			add_location(span8, file$4, 140, 28, 5203);
    			attr_dev(a2, "href", "#");
    			add_location(a2, file$4, 140, 16, 5191);
    			attr_dev(div16, "class", "xs-avatar-title");
    			add_location(div16, file$4, 139, 14, 5144);
    			attr_dev(div17, "class", "row xs-margin-0");
    			add_location(div17, file$4, 135, 12, 4960);
    			attr_dev(span9, "class", "xs-separetor");
    			add_location(span9, file$4, 144, 12, 5290);
    			attr_dev(a3, "href", "#");
    			attr_dev(a3, "data-toggle", "modal");
    			attr_dev(a3, "data-target", "#exampleModal");
    			attr_dev(a3, "class", "btn btn-primary btn-block");
    			add_location(a3, file$4, 146, 12, 5335);
    			attr_dev(div18, "class", "xs-item-content");
    			add_location(div18, file$4, 112, 10, 4179);
    			attr_dev(div19, "class", "xs-popular-item xs-box-shadow");
    			add_location(div19, file$4, 95, 8, 3572);
    			attr_dev(div20, "class", "col-lg-4 col-md-6");
    			add_location(div20, file$4, 16, 6, 604);
    			attr_dev(div21, "class", "row");
    			add_location(div21, file$4, 15, 4, 579);
    			attr_dev(div22, "class", "container");
    			add_location(div22, file$4, 2, 2, 114);
    			attr_dev(section, "id", "popularcause");
    			attr_dev(section, "class", "bg-gray waypoint-tigger xs-section-padding");
    			add_location(section, file$4, 1, 0, 32);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			append_dev(section, div22);
    			append_dev(div22, div1);
    			append_dev(div1, div0);
    			append_dev(div0, h2);
    			append_dev(div0, t1);
    			append_dev(div0, span0);
    			append_dev(div0, t2);
    			append_dev(div0, p0);
    			append_dev(p0, t3);
    			append_dev(p0, br);
    			append_dev(p0, t4);
    			append_dev(div22, t5);
    			append_dev(div22, div21);
    			append_dev(div21, div20);
    			append_dev(div20, div11);
    			append_dev(div11, div10);
    			append_dev(div10, div9);
    			append_dev(div9, div2);
    			append_dev(div2, h5);
    			append_dev(div2, t7);
    			append_dev(div2, button0);
    			append_dev(button0, span1);
    			append_dev(div9, t9);
    			append_dev(div9, div7);
    			append_dev(div7, form);
    			append_dev(form, div3);
    			append_dev(div3, label0);
    			append_dev(div3, t11);
    			append_dev(div3, input0);
    			append_dev(form, t12);
    			append_dev(form, div4);
    			append_dev(div4, label1);
    			append_dev(div4, t14);
    			append_dev(div4, input1);
    			append_dev(form, t15);
    			append_dev(form, div5);
    			append_dev(div5, label2);
    			append_dev(div5, t17);
    			append_dev(div5, input2);
    			append_dev(form, t18);
    			append_dev(form, div6);
    			append_dev(div6, input3);
    			append_dev(div6, t19);
    			append_dev(div6, label3);
    			append_dev(div9, t21);
    			append_dev(div9, div8);
    			append_dev(div8, button1);
    			append_dev(div20, t23);
    			append_dev(div20, div19);
    			append_dev(div19, div14);
    			append_dev(div14, img0);
    			append_dev(div14, t24);
    			append_dev(div14, div13);
    			append_dev(div13, div12);
    			append_dev(div12, p1);
    			append_dev(p1, span2);
    			append_dev(p1, t26);
    			append_dev(div19, t27);
    			append_dev(div19, div18);
    			append_dev(div18, ul0);
    			append_dev(ul0, li0);
    			append_dev(li0, a0);
    			append_dev(div18, t29);
    			append_dev(div18, a1);
    			append_dev(div18, t31);
    			append_dev(div18, ul1);
    			append_dev(ul1, li1);
    			append_dev(li1, t32);
    			append_dev(li1, span3);
    			append_dev(ul1, t34);
    			append_dev(ul1, li2);
    			append_dev(li2, span4);
    			append_dev(li2, t36);
    			append_dev(li2, span5);
    			append_dev(ul1, t38);
    			append_dev(ul1, li3);
    			append_dev(li3, t39);
    			append_dev(li3, span6);
    			append_dev(div18, t41);
    			append_dev(div18, span7);
    			append_dev(div18, t42);
    			append_dev(div18, div17);
    			append_dev(div17, div15);
    			append_dev(div15, img1);
    			append_dev(div17, t43);
    			append_dev(div17, div16);
    			append_dev(div16, a2);
    			append_dev(a2, span8);
    			append_dev(a2, t45);
    			append_dev(div18, t46);
    			append_dev(div18, span9);
    			append_dev(div18, t47);
    			append_dev(div18, a3);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("CharityList", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<CharityList> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class CharityList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "CharityList",
    			options,
    			id: create_fragment$6.name
    		});
    	}
    }

    /* src\components\Header.svelte generated by Svelte v3.38.3 */

    const file$3 = "src\\components\\Header.svelte";

    function create_fragment$5(ctx) {
    	let header;
    	let div6;
    	let nav;
    	let div1;
    	let div0;
    	let t0;
    	let a0;
    	let img0;
    	let img0_src_value;
    	let t1;
    	let div5;
    	let div2;
    	let a1;
    	let img1;
    	let img1_src_value;
    	let t2;
    	let div3;
    	let ul;
    	let li0;
    	let a2;
    	let t4;
    	let li1;
    	let a3;
    	let t6;
    	let li2;
    	let a4;
    	let t8;
    	let div4;
    	let a5;
    	let span;
    	let i;
    	let t9;

    	const block = {
    		c: function create() {
    			header = element("header");
    			div6 = element("div");
    			nav = element("nav");
    			div1 = element("div");
    			div0 = element("div");
    			t0 = space();
    			a0 = element("a");
    			img0 = element("img");
    			t1 = space();
    			div5 = element("div");
    			div2 = element("div");
    			a1 = element("a");
    			img1 = element("img");
    			t2 = space();
    			div3 = element("div");
    			ul = element("ul");
    			li0 = element("li");
    			a2 = element("a");
    			a2.textContent = "home";
    			t4 = space();
    			li1 = element("li");
    			a3 = element("a");
    			a3.textContent = "about";
    			t6 = space();
    			li2 = element("li");
    			a4 = element("a");
    			a4.textContent = "Contact";
    			t8 = space();
    			div4 = element("div");
    			a5 = element("a");
    			span = element("span");
    			i = element("i");
    			t9 = text(" Donate Now");
    			attr_dev(div0, "class", "nav-toggle");
    			add_location(div0, file$3, 11, 8, 309);
    			if (img0.src !== (img0_src_value = "assets/images/logo.png")) attr_dev(img0, "src", img0_src_value);
    			attr_dev(img0, "alt", "");
    			add_location(img0, file$3, 13, 10, 395);
    			attr_dev(a0, "href", "index.html");
    			attr_dev(a0, "class", "nav-logo");
    			add_location(a0, file$3, 12, 8, 345);
    			attr_dev(div1, "class", "nav-header");
    			add_location(div1, file$3, 10, 6, 275);
    			if (img1.src !== (img1_src_value = "assets/images/logo.png")) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "alt", "");
    			add_location(img1, file$3, 20, 12, 666);
    			attr_dev(a1, "class", "nav-brand");
    			attr_dev(a1, "href", "index.html");
    			add_location(a1, file$3, 19, 10, 613);
    			attr_dev(div2, "class", "xs-logo-wraper col-lg-2 xs-padding-0");
    			add_location(div2, file$3, 18, 8, 551);
    			attr_dev(a2, "href", "index.html");
    			add_location(a2, file$3, 26, 16, 862);
    			add_location(li0, file$3, 26, 12, 858);
    			attr_dev(a3, "href", "about.html");
    			add_location(a3, file$3, 27, 16, 914);
    			add_location(li1, file$3, 27, 12, 910);
    			attr_dev(a4, "href", "contact.html");
    			add_location(a4, file$3, 28, 16, 967);
    			add_location(li2, file$3, 28, 12, 963);
    			attr_dev(ul, "class", "nav-menu");
    			add_location(ul, file$3, 25, 10, 823);
    			attr_dev(div3, "class", "col-lg-7");
    			add_location(div3, file$3, 24, 8, 789);
    			attr_dev(i, "class", "fa fa-heart");
    			add_location(i, file$3, 34, 32, 1232);
    			attr_dev(span, "class", "badge");
    			add_location(span, file$3, 34, 12, 1212);
    			attr_dev(a5, "href", "#popularcause");
    			attr_dev(a5, "class", "btn btn-primary");
    			add_location(a5, file$3, 33, 10, 1150);
    			attr_dev(div4, "class", "xs-navs-button d-flex-center-end col-lg-3");
    			add_location(div4, file$3, 32, 8, 1083);
    			attr_dev(div5, "class", "nav-menus-wrapper row");
    			add_location(div5, file$3, 17, 6, 506);
    			attr_dev(nav, "class", "xs-menus");
    			add_location(nav, file$3, 9, 4, 245);
    			attr_dev(div6, "class", "container");
    			add_location(div6, file$3, 8, 2, 216);
    			attr_dev(header, "class", "xs-header header-transparent");
    			add_location(header, file$3, 7, 0, 167);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, header, anchor);
    			append_dev(header, div6);
    			append_dev(div6, nav);
    			append_dev(nav, div1);
    			append_dev(div1, div0);
    			append_dev(div1, t0);
    			append_dev(div1, a0);
    			append_dev(a0, img0);
    			append_dev(nav, t1);
    			append_dev(nav, div5);
    			append_dev(div5, div2);
    			append_dev(div2, a1);
    			append_dev(a1, img1);
    			append_dev(div5, t2);
    			append_dev(div5, div3);
    			append_dev(div3, ul);
    			append_dev(ul, li0);
    			append_dev(li0, a2);
    			append_dev(ul, t4);
    			append_dev(ul, li1);
    			append_dev(li1, a3);
    			append_dev(ul, t6);
    			append_dev(ul, li2);
    			append_dev(li2, a4);
    			append_dev(div5, t8);
    			append_dev(div5, div4);
    			append_dev(div4, a5);
    			append_dev(a5, span);
    			append_dev(span, i);
    			append_dev(a5, t9);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(header);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Header", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Header> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class Header extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Header",
    			options,
    			id: create_fragment$5.name
    		});
    	}
    }

    /* src\components\Welcome.svelte generated by Svelte v3.38.3 */

    const file$2 = "src\\components\\Welcome.svelte";

    function create_fragment$4(ctx) {
    	let section;
    	let div4;
    	let div3;
    	let div1;
    	let div0;
    	let h2;
    	let t1;
    	let p;
    	let t2;
    	let br;
    	let t3;
    	let t4;
    	let a;
    	let t6;
    	let div2;

    	const block = {
    		c: function create() {
    			section = element("section");
    			div4 = element("div");
    			div3 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Hunger is stalking the globe";
    			t1 = space();
    			p = element("p");
    			t2 = text("Hundreds of thousands of children experiencing or witnessing assault\r\n            ");
    			br = element("br");
    			t3 = text("\r\n            and other gender-based violence.");
    			t4 = space();
    			a = element("a");
    			a.textContent = "View Causes";
    			t6 = space();
    			div2 = element("div");
    			add_location(h2, file$2, 9, 10, 264);
    			add_location(br, file$2, 12, 12, 412);
    			add_location(p, file$2, 10, 10, 313);
    			attr_dev(a, "href", "#popularcause");
    			attr_dev(a, "class", "btn btn-outline-primary");
    			add_location(a, file$2, 15, 10, 492);
    			attr_dev(div0, "class", "xs-welcome-wraper color-white");
    			add_location(div0, file$2, 8, 8, 209);
    			attr_dev(div1, "class", "container");
    			add_location(div1, file$2, 7, 6, 176);
    			attr_dev(div2, "class", "xs-black-overlay");
    			add_location(div2, file$2, 22, 6, 699);
    			attr_dev(div3, "class", "xs-welcome-content");
    			set_style(div3, "background-image", "url(assets/images/slide1.png)");
    			add_location(div3, file$2, 3, 4, 59);
    			add_location(div4, file$2, 2, 2, 48);
    			attr_dev(section, "class", "");
    			add_location(section, file$2, 1, 0, 26);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			append_dev(section, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div1);
    			append_dev(div1, div0);
    			append_dev(div0, h2);
    			append_dev(div0, t1);
    			append_dev(div0, p);
    			append_dev(p, t2);
    			append_dev(p, br);
    			append_dev(p, t3);
    			append_dev(div0, t4);
    			append_dev(div0, a);
    			append_dev(div3, t6);
    			append_dev(div3, div2);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Welcome", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Welcome> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class Welcome extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Welcome",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    /* src\components\Promo.svelte generated by Svelte v3.38.3 */

    const file$1 = "src\\components\\Promo.svelte";

    function create_fragment$3(ctx) {
    	let section;
    	let div10;
    	let div0;
    	let h2;
    	let t0;
    	let span0;
    	let t2;
    	let br0;
    	let t3;
    	let t4;
    	let div9;
    	let div2;
    	let div1;
    	let span1;
    	let t5;
    	let h50;
    	let t6;
    	let br1;
    	let t7;
    	let t8;
    	let p0;
    	let t10;
    	let div4;
    	let div3;
    	let span2;
    	let t11;
    	let h51;
    	let t12;
    	let br2;
    	let t13;
    	let t14;
    	let p1;
    	let t16;
    	let div6;
    	let div5;
    	let span3;
    	let t17;
    	let h52;
    	let t18;
    	let br3;
    	let t19;
    	let t20;
    	let p2;
    	let t22;
    	let div8;
    	let div7;
    	let span4;
    	let t23;
    	let h53;
    	let t24;
    	let br4;
    	let t25;
    	let t26;
    	let p3;

    	const block = {
    		c: function create() {
    			section = element("section");
    			div10 = element("div");
    			div0 = element("div");
    			h2 = element("h2");
    			t0 = text("We’ve funded ");
    			span0 = element("span");
    			span0.textContent = "120,00 charity projects";
    			t2 = text(" for ");
    			br0 = element("br");
    			t3 = text(" 20M people around\r\n        the world.");
    			t4 = space();
    			div9 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			span1 = element("span");
    			t5 = space();
    			h50 = element("h5");
    			t6 = text("Pure Water ");
    			br1 = element("br");
    			t7 = text("For Poor People");
    			t8 = space();
    			p0 = element("p");
    			p0.textContent = "663 million people drink dirty water. Learn how access to clean\r\n            water can improve health, boost local economies.";
    			t10 = space();
    			div4 = element("div");
    			div3 = element("div");
    			span2 = element("span");
    			t11 = space();
    			h51 = element("h5");
    			t12 = text("Healty Food ");
    			br2 = element("br");
    			t13 = text("For Poor People");
    			t14 = space();
    			p1 = element("p");
    			p1.textContent = "663 million people drink dirty water. Learn how access to clean\r\n            water can improve health, boost local economies.";
    			t16 = space();
    			div6 = element("div");
    			div5 = element("div");
    			span3 = element("span");
    			t17 = space();
    			h52 = element("h5");
    			t18 = text("Medical ");
    			br3 = element("br");
    			t19 = text("Facilities for People");
    			t20 = space();
    			p2 = element("p");
    			p2.textContent = "663 million people drink dirty water. Learn how access to clean\r\n            water can improve health, boost local economies.";
    			t22 = space();
    			div8 = element("div");
    			div7 = element("div");
    			span4 = element("span");
    			t23 = space();
    			h53 = element("h5");
    			t24 = text("Pure Education ");
    			br4 = element("br");
    			t25 = text("For Every Children");
    			t26 = space();
    			p3 = element("p");
    			p3.textContent = "663 million people drink dirty water. Learn how access to clean\r\n            water can improve health, boost local economies.";
    			add_location(span0, file$1, 5, 21, 212);
    			add_location(br0, file$1, 5, 62, 253);
    			attr_dev(h2, "class", "xs-mb-0 xs-title");
    			add_location(h2, file$1, 4, 6, 160);
    			attr_dev(div0, "class", "xs-heading xs-mb-70 text-center");
    			add_location(div0, file$1, 3, 4, 107);
    			attr_dev(span1, "class", "icon-water");
    			add_location(span1, file$1, 12, 10, 436);
    			add_location(br1, file$1, 13, 25, 490);
    			add_location(h50, file$1, 13, 10, 475);
    			add_location(p0, file$1, 14, 10, 528);
    			attr_dev(div1, "class", "xs-service-promo");
    			add_location(div1, file$1, 11, 8, 394);
    			attr_dev(div2, "class", "col-md-6 col-lg-3");
    			add_location(div2, file$1, 10, 6, 353);
    			attr_dev(span2, "class", "icon-groceries");
    			add_location(span2, file$1, 23, 10, 847);
    			add_location(br2, file$1, 24, 26, 906);
    			add_location(h51, file$1, 24, 10, 890);
    			add_location(p1, file$1, 25, 10, 944);
    			attr_dev(div3, "class", "xs-service-promo");
    			add_location(div3, file$1, 22, 8, 805);
    			attr_dev(div4, "class", "col-md-6 col-lg-3");
    			add_location(div4, file$1, 21, 6, 764);
    			attr_dev(span3, "class", "icon-heartbeat");
    			add_location(span3, file$1, 34, 10, 1263);
    			add_location(br3, file$1, 35, 22, 1318);
    			add_location(h52, file$1, 35, 10, 1306);
    			add_location(p2, file$1, 36, 10, 1362);
    			attr_dev(div5, "class", "xs-service-promo");
    			add_location(div5, file$1, 33, 8, 1221);
    			attr_dev(div6, "class", "col-md-6 col-lg-3");
    			add_location(div6, file$1, 32, 6, 1180);
    			attr_dev(span4, "class", "icon-open-book");
    			add_location(span4, file$1, 45, 10, 1681);
    			add_location(br4, file$1, 46, 29, 1743);
    			add_location(h53, file$1, 46, 10, 1724);
    			add_location(p3, file$1, 47, 10, 1784);
    			attr_dev(div7, "class", "xs-service-promo");
    			add_location(div7, file$1, 44, 8, 1639);
    			attr_dev(div8, "class", "col-md-6 col-lg-3");
    			add_location(div8, file$1, 43, 6, 1598);
    			attr_dev(div9, "class", "row");
    			add_location(div9, file$1, 9, 4, 328);
    			attr_dev(div10, "class", "container");
    			add_location(div10, file$1, 2, 2, 78);
    			attr_dev(section, "class", "xs-section-padding");
    			add_location(section, file$1, 1, 0, 38);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			append_dev(section, div10);
    			append_dev(div10, div0);
    			append_dev(div0, h2);
    			append_dev(h2, t0);
    			append_dev(h2, span0);
    			append_dev(h2, t2);
    			append_dev(h2, br0);
    			append_dev(h2, t3);
    			append_dev(div10, t4);
    			append_dev(div10, div9);
    			append_dev(div9, div2);
    			append_dev(div2, div1);
    			append_dev(div1, span1);
    			append_dev(div1, t5);
    			append_dev(div1, h50);
    			append_dev(h50, t6);
    			append_dev(h50, br1);
    			append_dev(h50, t7);
    			append_dev(div1, t8);
    			append_dev(div1, p0);
    			append_dev(div9, t10);
    			append_dev(div9, div4);
    			append_dev(div4, div3);
    			append_dev(div3, span2);
    			append_dev(div3, t11);
    			append_dev(div3, h51);
    			append_dev(h51, t12);
    			append_dev(h51, br2);
    			append_dev(h51, t13);
    			append_dev(div3, t14);
    			append_dev(div3, p1);
    			append_dev(div9, t16);
    			append_dev(div9, div6);
    			append_dev(div6, div5);
    			append_dev(div5, span3);
    			append_dev(div5, t17);
    			append_dev(div5, h52);
    			append_dev(h52, t18);
    			append_dev(h52, br3);
    			append_dev(h52, t19);
    			append_dev(div5, t20);
    			append_dev(div5, p2);
    			append_dev(div9, t22);
    			append_dev(div9, div8);
    			append_dev(div8, div7);
    			append_dev(div7, span4);
    			append_dev(div7, t23);
    			append_dev(div7, h53);
    			append_dev(h53, t24);
    			append_dev(h53, br4);
    			append_dev(h53, t25);
    			append_dev(div7, t26);
    			append_dev(div7, p3);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Promo", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Promo> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class Promo extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Promo",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    /* src\components\Footer.svelte generated by Svelte v3.38.3 */

    const file = "src\\components\\Footer.svelte";

    function create_fragment$2(ctx) {
    	let footer;
    	let div5;
    	let div4;
    	let div3;
    	let div0;
    	let a0;
    	let img;
    	let img_src_value;
    	let t0;
    	let p0;
    	let t2;
    	let ul0;
    	let li0;
    	let a1;
    	let i0;
    	let t3;
    	let li1;
    	let a2;
    	let i1;
    	let t4;
    	let li2;
    	let a3;
    	let i2;
    	let t5;
    	let li3;
    	let a4;
    	let i3;
    	let t6;
    	let div1;
    	let h30;
    	let t8;
    	let ul1;
    	let li4;
    	let a5;
    	let t10;
    	let li5;
    	let a6;
    	let t12;
    	let li6;
    	let a7;
    	let t14;
    	let li7;
    	let a8;
    	let t16;
    	let li8;
    	let a9;
    	let t18;
    	let li9;
    	let a10;
    	let t20;
    	let div2;
    	let h31;
    	let t22;
    	let ul2;
    	let li10;
    	let i4;
    	let t23;
    	let t24;
    	let li11;
    	let i5;
    	let t25;
    	let t26;
    	let li12;
    	let i6;
    	let a11;
    	let t28;
    	let div11;
    	let div10;
    	let div9;
    	let div7;
    	let div6;
    	let p1;
    	let t30;
    	let div8;
    	let nav;
    	let ul3;
    	let li13;
    	let a12;
    	let t32;
    	let li14;
    	let a13;
    	let t34;
    	let li15;
    	let a14;
    	let t36;
    	let div12;
    	let a15;
    	let i7;

    	const block = {
    		c: function create() {
    			footer = element("footer");
    			div5 = element("div");
    			div4 = element("div");
    			div3 = element("div");
    			div0 = element("div");
    			a0 = element("a");
    			img = element("img");
    			t0 = space();
    			p0 = element("p");
    			p0.textContent = "CharityPress online and raise money for charity and causes you’re\r\n            passionate about. CharityPress is an innovative, cost-effective\r\n            online.";
    			t2 = space();
    			ul0 = element("ul");
    			li0 = element("li");
    			a1 = element("a");
    			i0 = element("i");
    			t3 = space();
    			li1 = element("li");
    			a2 = element("a");
    			i1 = element("i");
    			t4 = space();
    			li2 = element("li");
    			a3 = element("a");
    			i2 = element("i");
    			t5 = space();
    			li3 = element("li");
    			a4 = element("a");
    			i3 = element("i");
    			t6 = space();
    			div1 = element("div");
    			h30 = element("h3");
    			h30.textContent = "About Us";
    			t8 = space();
    			ul1 = element("ul");
    			li4 = element("li");
    			a5 = element("a");
    			a5.textContent = "About employee";
    			t10 = space();
    			li5 = element("li");
    			a6 = element("a");
    			a6.textContent = "How it works";
    			t12 = space();
    			li6 = element("li");
    			a7 = element("a");
    			a7.textContent = "Careers";
    			t14 = space();
    			li7 = element("li");
    			a8 = element("a");
    			a8.textContent = "Press";
    			t16 = space();
    			li8 = element("li");
    			a9 = element("a");
    			a9.textContent = "Blog";
    			t18 = space();
    			li9 = element("li");
    			a10 = element("a");
    			a10.textContent = "Contact";
    			t20 = space();
    			div2 = element("div");
    			h31 = element("h3");
    			h31.textContent = "Contact Us";
    			t22 = space();
    			ul2 = element("ul");
    			li10 = element("li");
    			i4 = element("i");
    			t23 = text("Sector # 48, 123 Street, miosya road VIC\r\n              28, Australia.");
    			t24 = space();
    			li11 = element("li");
    			i5 = element("i");
    			t25 = text("(800) 123.456.7890 (800) 123.456.7890 +00\r\n              99 88 5647");
    			t26 = space();
    			li12 = element("li");
    			i6 = element("i");
    			a11 = element("a");
    			a11.textContent = "yourname@domain.com";
    			t28 = space();
    			div11 = element("div");
    			div10 = element("div");
    			div9 = element("div");
    			div7 = element("div");
    			div6 = element("div");
    			p1 = element("p");
    			p1.textContent = "© Copyright 2018 Charity - All Right's Reserved";
    			t30 = space();
    			div8 = element("div");
    			nav = element("nav");
    			ul3 = element("ul");
    			li13 = element("li");
    			a12 = element("a");
    			a12.textContent = "FAQ";
    			t32 = space();
    			li14 = element("li");
    			a13 = element("a");
    			a13.textContent = "Help Desk";
    			t34 = space();
    			li15 = element("li");
    			a14 = element("a");
    			a14.textContent = "Support";
    			t36 = space();
    			div12 = element("div");
    			a15 = element("a");
    			i7 = element("i");
    			if (img.src !== (img_src_value = "assets/images/footer_logo.png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "");
    			add_location(img, file, 7, 12, 290);
    			attr_dev(a0, "href", "index.html");
    			attr_dev(a0, "class", "xs-footer-logo");
    			add_location(a0, file, 6, 10, 232);
    			add_location(p0, file, 9, 10, 368);
    			attr_dev(i0, "class", "fa fa-facebook");
    			add_location(i0, file, 16, 48, 674);
    			attr_dev(a1, "href", "");
    			attr_dev(a1, "class", "color-facebook");
    			add_location(a1, file, 16, 14, 640);
    			add_location(li0, file, 15, 12, 620);
    			attr_dev(i1, "class", "fa fa-twitter");
    			add_location(i1, file, 19, 47, 792);
    			attr_dev(a2, "href", "");
    			attr_dev(a2, "class", "color-twitter");
    			add_location(a2, file, 19, 14, 759);
    			add_location(li1, file, 18, 12, 739);
    			attr_dev(i2, "class", "fa fa-dribbble");
    			add_location(i2, file, 22, 48, 910);
    			attr_dev(a3, "href", "");
    			attr_dev(a3, "class", "color-dribbble");
    			add_location(a3, file, 22, 14, 876);
    			add_location(li2, file, 21, 12, 856);
    			attr_dev(i3, "class", "fa fa-pinterest");
    			add_location(i3, file, 26, 17, 1048);
    			attr_dev(a4, "href", "");
    			attr_dev(a4, "class", "color-pinterest");
    			add_location(a4, file, 25, 14, 995);
    			add_location(li3, file, 24, 12, 975);
    			attr_dev(ul0, "class", "xs-social-list-v2");
    			add_location(ul0, file, 14, 10, 576);
    			attr_dev(div0, "class", "col-lg-3 col-md-6 footer-widget xs-pr-20");
    			add_location(div0, file, 5, 8, 166);
    			attr_dev(h30, "class", "widget-title");
    			add_location(h30, file, 33, 10, 1256);
    			attr_dev(a5, "href", "index.html");
    			add_location(a5, file, 35, 16, 1351);
    			add_location(li4, file, 35, 12, 1347);
    			attr_dev(a6, "href", "#");
    			add_location(a6, file, 36, 16, 1413);
    			add_location(li5, file, 36, 12, 1409);
    			attr_dev(a7, "href", "#");
    			add_location(a7, file, 37, 16, 1464);
    			add_location(li6, file, 37, 12, 1460);
    			attr_dev(a8, "href", "#");
    			add_location(a8, file, 38, 16, 1510);
    			add_location(li7, file, 38, 12, 1506);
    			attr_dev(a9, "href", "#");
    			add_location(a9, file, 39, 16, 1554);
    			add_location(li8, file, 39, 12, 1550);
    			attr_dev(a10, "href", "#");
    			add_location(a10, file, 40, 16, 1597);
    			add_location(li9, file, 40, 12, 1593);
    			attr_dev(ul1, "class", "xs-footer-list");
    			add_location(ul1, file, 34, 10, 1306);
    			attr_dev(div1, "class", "col-lg-4 col-md-6 footer-widget");
    			add_location(div1, file, 32, 8, 1199);
    			attr_dev(h31, "class", "widget-title");
    			add_location(h31, file, 44, 10, 1725);
    			attr_dev(i4, "class", "fa fa-home");
    			add_location(i4, file, 47, 14, 1836);
    			add_location(li10, file, 46, 12, 1816);
    			attr_dev(i5, "class", "fa fa-phone");
    			add_location(i5, file, 51, 14, 1983);
    			add_location(li11, file, 50, 12, 1963);
    			attr_dev(i6, "class", "fa fa-envelope-o");
    			add_location(i6, file, 55, 14, 2128);
    			attr_dev(a11, "href", "mailto:yourname@domain.com");
    			add_location(a11, file, 55, 44, 2158);
    			add_location(li12, file, 54, 12, 2108);
    			attr_dev(ul2, "class", "xs-info-list");
    			add_location(ul2, file, 45, 10, 1777);
    			attr_dev(div2, "class", "col-lg-4 col-md-6 footer-widget");
    			add_location(div2, file, 43, 8, 1668);
    			attr_dev(div3, "class", "row");
    			add_location(div3, file, 4, 6, 139);
    			attr_dev(div4, "class", "xs-footer-top-layer");
    			add_location(div4, file, 3, 4, 98);
    			attr_dev(div5, "class", "container");
    			add_location(div5, file, 2, 2, 69);
    			add_location(p1, file, 70, 12, 2556);
    			attr_dev(div6, "class", "xs-copyright-text");
    			add_location(div6, file, 69, 10, 2511);
    			attr_dev(div7, "class", "col-md-6");
    			add_location(div7, file, 68, 8, 2477);
    			attr_dev(a12, "href", "#");
    			add_location(a12, file, 76, 18, 2759);
    			add_location(li13, file, 76, 14, 2755);
    			attr_dev(a13, "href", "#");
    			add_location(a13, file, 77, 18, 2803);
    			add_location(li14, file, 77, 14, 2799);
    			attr_dev(a14, "href", "#");
    			add_location(a14, file, 78, 18, 2853);
    			add_location(li15, file, 78, 14, 2849);
    			add_location(ul3, file, 75, 12, 2735);
    			attr_dev(nav, "class", "xs-footer-menu");
    			add_location(nav, file, 74, 10, 2693);
    			attr_dev(div8, "class", "col-md-6");
    			add_location(div8, file, 73, 8, 2659);
    			attr_dev(div9, "class", "row");
    			add_location(div9, file, 67, 6, 2450);
    			attr_dev(div10, "class", "xs-copyright");
    			add_location(div10, file, 66, 4, 2416);
    			attr_dev(div11, "class", "container");
    			add_location(div11, file, 65, 2, 2387);
    			attr_dev(i7, "class", "fa fa-angle-up");
    			add_location(i7, file, 86, 39, 3050);
    			attr_dev(a15, "href", "#");
    			attr_dev(a15, "class", "xs-back-to-top");
    			add_location(a15, file, 86, 4, 3015);
    			attr_dev(div12, "class", "xs-back-to-top-wraper");
    			add_location(div12, file, 85, 2, 2974);
    			attr_dev(footer, "class", "xs-footer-section");
    			add_location(footer, file, 1, 0, 31);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, footer, anchor);
    			append_dev(footer, div5);
    			append_dev(div5, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div0);
    			append_dev(div0, a0);
    			append_dev(a0, img);
    			append_dev(div0, t0);
    			append_dev(div0, p0);
    			append_dev(div0, t2);
    			append_dev(div0, ul0);
    			append_dev(ul0, li0);
    			append_dev(li0, a1);
    			append_dev(a1, i0);
    			append_dev(ul0, t3);
    			append_dev(ul0, li1);
    			append_dev(li1, a2);
    			append_dev(a2, i1);
    			append_dev(ul0, t4);
    			append_dev(ul0, li2);
    			append_dev(li2, a3);
    			append_dev(a3, i2);
    			append_dev(ul0, t5);
    			append_dev(ul0, li3);
    			append_dev(li3, a4);
    			append_dev(a4, i3);
    			append_dev(div3, t6);
    			append_dev(div3, div1);
    			append_dev(div1, h30);
    			append_dev(div1, t8);
    			append_dev(div1, ul1);
    			append_dev(ul1, li4);
    			append_dev(li4, a5);
    			append_dev(ul1, t10);
    			append_dev(ul1, li5);
    			append_dev(li5, a6);
    			append_dev(ul1, t12);
    			append_dev(ul1, li6);
    			append_dev(li6, a7);
    			append_dev(ul1, t14);
    			append_dev(ul1, li7);
    			append_dev(li7, a8);
    			append_dev(ul1, t16);
    			append_dev(ul1, li8);
    			append_dev(li8, a9);
    			append_dev(ul1, t18);
    			append_dev(ul1, li9);
    			append_dev(li9, a10);
    			append_dev(div3, t20);
    			append_dev(div3, div2);
    			append_dev(div2, h31);
    			append_dev(div2, t22);
    			append_dev(div2, ul2);
    			append_dev(ul2, li10);
    			append_dev(li10, i4);
    			append_dev(li10, t23);
    			append_dev(ul2, t24);
    			append_dev(ul2, li11);
    			append_dev(li11, i5);
    			append_dev(li11, t25);
    			append_dev(ul2, t26);
    			append_dev(ul2, li12);
    			append_dev(li12, i6);
    			append_dev(li12, a11);
    			append_dev(footer, t28);
    			append_dev(footer, div11);
    			append_dev(div11, div10);
    			append_dev(div10, div9);
    			append_dev(div9, div7);
    			append_dev(div7, div6);
    			append_dev(div6, p1);
    			append_dev(div9, t30);
    			append_dev(div9, div8);
    			append_dev(div8, nav);
    			append_dev(nav, ul3);
    			append_dev(ul3, li13);
    			append_dev(li13, a12);
    			append_dev(ul3, t32);
    			append_dev(ul3, li14);
    			append_dev(li14, a13);
    			append_dev(ul3, t34);
    			append_dev(ul3, li15);
    			append_dev(li15, a14);
    			append_dev(footer, t36);
    			append_dev(footer, div12);
    			append_dev(div12, a15);
    			append_dev(a15, i7);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(footer);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Footer", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Footer> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class Footer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Footer",
    			options,
    			id: create_fragment$2.name
    		});
    	}
    }

    var charities = {
      charities: [
        {
          id: 1,
          title: "First Charity Project",
          category: "Money",
          thumbnail:
            "https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.cumanagement.com%2Farticles%2F2017%2F05%2Fcharitable-donation-account-and-benefits-pre-funding-basics&psig=AOvVaw3_M7oTgirIt2Cq_weFiDkJ&ust=1625592979157000&source=images&cd=vfe&ved=0CAoQjRxqFwoTCLi31vS7zPECFQAAAAAdAAAAABAD",
          pledged: 0,
          target: 100000,
          date_end: +new Date("10 August 2020"),
          profile_photo:
            "https://www.google.com/url?sa=i&url=https%3A%2F%2Fpreview.keenthemes.com%2Fmetronic-v4%2Ftheme%2Fadmin_1%2Fpage_user_profile_1_help.html&psig=AOvVaw3ideUISc1wfR-UAdMlmbCn&ust=1625593017797000&source=images&cd=vfe&ved=0CAoQjRxqFwoTCKCAtYa8zPECFQAAAAAdAAAAABAD",
          profile_name: "Ryan Hartadi",
          no_pledges: 0,
        },
      ],
    };

    /* src\pages\Home.svelte generated by Svelte v3.38.3 */

    function create_fragment$1(ctx) {
    	let header;
    	let t0;
    	let welcome;
    	let t1;
    	let charitylist;
    	let t2;
    	let promo;
    	let t3;
    	let footer;
    	let current;
    	header = new Header({ $$inline: true });
    	welcome = new Welcome({ $$inline: true });
    	charitylist = new CharityList({ props: { charities: charities.charities }, $$inline: true });
    	promo = new Promo({ $$inline: true });
    	footer = new Footer({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(header.$$.fragment);
    			t0 = space();
    			create_component(welcome.$$.fragment);
    			t1 = space();
    			create_component(charitylist.$$.fragment);
    			t2 = space();
    			create_component(promo.$$.fragment);
    			t3 = space();
    			create_component(footer.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(header, target, anchor);
    			insert_dev(target, t0, anchor);
    			mount_component(welcome, target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(charitylist, target, anchor);
    			insert_dev(target, t2, anchor);
    			mount_component(promo, target, anchor);
    			insert_dev(target, t3, anchor);
    			mount_component(footer, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(header.$$.fragment, local);
    			transition_in(welcome.$$.fragment, local);
    			transition_in(charitylist.$$.fragment, local);
    			transition_in(promo.$$.fragment, local);
    			transition_in(footer.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(header.$$.fragment, local);
    			transition_out(welcome.$$.fragment, local);
    			transition_out(charitylist.$$.fragment, local);
    			transition_out(promo.$$.fragment, local);
    			transition_out(footer.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(header, detaching);
    			if (detaching) detach_dev(t0);
    			destroy_component(welcome, detaching);
    			if (detaching) detach_dev(t1);
    			destroy_component(charitylist, detaching);
    			if (detaching) detach_dev(t2);
    			destroy_component(promo, detaching);
    			if (detaching) detach_dev(t3);
    			destroy_component(footer, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Home", slots, []);
    	let title = "Charity";

    	setTimeout(
    		() => {
    			title = "Donation";
    		},
    		2000
    	);

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Home> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		CharityList,
    		Header,
    		Welcome,
    		Promo,
    		Footer,
    		charities: charities.charities,
    		title
    	});

    	$$self.$inject_state = $$props => {
    		if ("title" in $$props) title = $$props.title;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [];
    }

    class Home extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Home",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src\App.svelte generated by Svelte v3.38.3 */

    function create_fragment(ctx) {
    	let home;
    	let current;
    	home = new Home({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(home.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(home, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(home.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(home.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(home, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("App", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ Home });
    	return [];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
      target: document.querySelector("#root"),
      props: {
        name: "world",
      },
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
