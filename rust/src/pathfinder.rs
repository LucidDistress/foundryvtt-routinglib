use std::{cell::RefCell, rc::Rc};

use rustc_hash::{FxHashMap, FxHashSet};

use crate::{
	geometry::{LineSegment, Point},
	graph::{Edge, Graph},
	next_node_queue::{DiscoveredNode, NextNodeQueue},
};

pub enum PathfindingResult {
	Unfinished,
	Path(DiscoveredNode),
	NoPath,
}

pub struct Pathfinder {
	graph: Rc<RefCell<Graph>>,
	edges: FxHashMap<Point, Vec<Edge>>,
	from: Point,
	to: Point,
	max_distance: f64,
	next_nodes: NextNodeQueue,
	previous_nodes: FxHashSet<Point>,
	discovered_nodes: FxHashMap<Point, DiscoveredNode>,
}

impl Pathfinder {
	pub fn initialize(
		from: Point,
		to: Point,
		graph: Rc<RefCell<Graph>>,
		max_distance: f64,
	) -> Self {
		let mut pathfinder = Self {
			graph,
			edges: FxHashMap::default(),
			from,
			to,
			max_distance,
			next_nodes: NextNodeQueue::new(),
			previous_nodes: FxHashSet::default(),
			discovered_nodes: FxHashMap::default(),
		};

		pathfinder.reset();

		pathfinder
	}

	pub fn reset(&mut self) {
		self.edges.clear();
		self.next_nodes.clear();
		self.previous_nodes.clear();
		self.discovered_nodes.clear();

		self.initialize_edges(self.from);
		let from_node = DiscoveredNode {
			point: self.from,
			cost: 0.0,
			estimated: self.from.distance_to(self.to),
			previous: None,
		};
		self.next_nodes.insert(from_node);
	}

	pub fn step(&mut self) -> PathfindingResult {
		if self.next_nodes.is_empty() {
			return PathfindingResult::NoPath;
		}
		// Get node with cheapest estimate
		let current_node = self.next_nodes.pop().unwrap();

		if exceeds_budget(current_node.cost, self.max_distance) {
			return PathfindingResult::Unfinished;
		}

		if current_node.point == self.to {
			return PathfindingResult::Path(current_node);
		}

		self.previous_nodes.insert(current_node.point);
		self.discovered_nodes
			.insert(current_node.point, current_node);

		for edge in self.edges.get(&current_node.point).unwrap().to_owned() {
			let neighbor = edge.target;
			if self.previous_nodes.contains(&neighbor) {
				continue;
			}
			// The budget and reported cost must use geometric distance only.
			let cost = current_node.cost + edge.cost;
			if exceeds_budget(cost, self.max_distance) {
				continue;
			}
			self.initialize_edges(neighbor);
			let discovered_neighbor = DiscoveredNode {
				point: neighbor,
				cost,
				estimated: cost + neighbor.distance_to(self.to),
				previous: Some(current_node.point),
			};
			self.next_nodes.insert(discovered_neighbor);
		}
		PathfindingResult::Unfinished
	}

	fn initialize_edges(&mut self, node: Point) {
		self.edges.entry(node).or_insert_with(|| {
			let mut graph = self.graph.borrow_mut();
			let mut edges = graph
				.edges
				.get(&node)
				.map(|edges| edges.to_owned())
				.unwrap_or_else(|| {
					let walls = &graph.walls;
					let edges = graph
						.nodes
						.iter()
						.filter(|point| Self::points_connected(node, **point, walls))
						.map(|point| Edge {
							target: *point,
							cost: node.distance_to(*point),
						})
						.collect::<Vec<_>>();
					// If node is 'from', don't insert it into "graph". Otherwise the graph will grow endlessly over time
					if node != self.from {
						graph.edges.insert(node, edges.clone());
					}
					edges
				});
			if Self::points_connected(node, self.to, &graph.walls) {
				edges.push(Edge {
					target: self.to,
					cost: node.distance_to(self.to),
				});
			}
			edges
		});
	}

	// TODO This could be a iterator to reduce the number of copy operations
	pub fn unroll_path(&self, first_node: DiscoveredNode) -> Vec<Point> {
		let mut path = vec![first_node.point];
		let mut current_node = first_node;
		while let Some(node) = current_node.previous {
			current_node = *self.discovered_nodes.get(&node).unwrap();
			path.push(current_node.point);
		}
		path.reverse();
		path
	}

	fn points_connected(p1: Point, p2: Point, walls: &[LineSegment]) -> bool {
		!Self::collides_with_any_wall(&LineSegment::new(p1, p2), walls)
	}

	fn collides_with_any_wall(line: &LineSegment, walls: &[LineSegment]) -> bool {
		// TODO Directional walls
		walls
			.iter()
			.any(|wall| Self::collides_with_wall(line, wall))
	}

	fn collides_with_wall(line: &LineSegment, wall: &LineSegment) -> bool {
		line.intersects(wall)
	}
}

// Permit only floating-point roundoff at exact budget boundaries.
fn exceeds_budget(cost: f64, budget: f64) -> bool {
	budget.is_finite()
		&& cost - budget > 16.0 * f64::EPSILON * cost.abs().max(budget.abs()).max(1.0)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn solve(graph: Graph, from: Point, to: Point, budget: f64) -> Option<(f64, Vec<Point>)> {
		let mut search = Pathfinder::initialize(from, to, Rc::new(RefCell::new(graph)), budget);
		for _ in 0..1000 {
			match search.step() {
				PathfindingResult::Path(node) => return Some((node.cost, search.unroll_path(node))),
				PathfindingResult::NoPath => return None,
				PathfindingResult::Unfinished => (),
			}
		}
		panic!("search did not terminate");
	}

	fn empty_graph() -> Graph {
		Graph { nodes: vec![], edges: FxHashMap::default(), walls: vec![] }
	}

	fn detour_graph() -> Graph {
		Graph {
			nodes: vec![Point::new(3.0, 4.0)],
			edges: FxHashMap::default(),
			walls: vec![LineSegment::new(Point::new(3.0, -1.0), Point::new(3.0, 3.0))],
		}
	}

	#[test]
	fn direct_path_accepts_exact_budget_without_penalty() {
		let from = Point::new(0.0, 0.0);
		let to = Point::new(3.0, 4.0);
		let (cost, path) = solve(empty_graph(), from, to, 5.0).unwrap();
		assert_eq!(cost, 5.0);
		assert_eq!(path, vec![from, to]);
		assert!(solve(empty_graph(), from, to, 4.999999).is_none());
	}

	#[test]
	fn detour_budget_matches_sum_of_segments() {
		let from = Point::new(0.0, 0.0);
		let to = Point::new(6.0, 0.0);
		let (cost, path) = solve(detour_graph(), from, to, 10.0).unwrap();
		assert_eq!(path, vec![from, Point::new(3.0, 4.0), to]);
		assert_eq!(cost, path.windows(2).map(|pair| pair[0].distance_to(pair[1])).sum::<f64>());
		assert!(solve(detour_graph(), from, to, 9.999999).is_none());
	}

	#[test]
	fn zero_distance_and_unbounded_requests() {
		let from = Point::new(0.0, 0.0);
		assert_eq!(solve(empty_graph(), from, from, 0.0), Some((0.0, vec![from])));
		assert_eq!(solve(empty_graph(), from, Point::new(3.0, 4.0), f64::INFINITY).unwrap().0, 5.0);
	}

	#[test]
	fn budget_tolerance_only_covers_roundoff() {
		assert!(!exceeds_budget(0.1 + 0.2, 0.3));
		assert!(exceeds_budget(0.30000001, 0.3));
	}
}
