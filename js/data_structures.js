/**
 * A combination queue/set where the elements are ordered (in ascending order, according to the given priority function)
 * and unique (according to the given elementMatcher).
 *
 * If an element is added to the set and an equivalent element already exists, the lower-priority one is discarded.
 */
export class PriorityQueueSet {
	constructor(elementMatcher, priorityFunction) {
		this.first = null;
		this.elementMatcher = elementMatcher;
		this.priorityFunction = priorityFunction;
	}

	pushWithPriority(value) {
		const priority = this.priorityFunction(value);
		// Remove an inferior equivalent before inserting in priority order.
		let previous = null;
		let current = this.first;
		while (current) {
			if (this.elementMatcher(current.value, value)) {
				if (current.priority <= priority) return;
				if (previous) previous.next = current.next;
				else this.first = current.next;
				break;
			}
			previous = current;
			current = current.next;
		}
		previous = null;
		current = this.first;
		while (current && current.priority <= priority) {
			previous = current;
			current = current.next;
		}
		const node = {value, priority, next: current};
		if (previous) previous.next = node;
		else this.first = node;
	}

	hasNext() {
		return !!this.first;
	}

	pop() {
		const first = this.first;
		this.first = first?.next;
		return first?.value;
	}
}
