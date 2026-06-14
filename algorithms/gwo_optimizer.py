# algorithms/nsga_optimizer.py
from dataclasses import dataclass
from typing import List, Tuple, Dict, Any
import math
import random

# Replacement for np.ndarray using a simple nested list class or type hints
Allocation = List[List[int]]

@dataclass
class Zone:
    id: int
    name: str
    risk_level: float
    area: float
    population: int
    domino_time: float
    neighbors: List[int]
    is_hazardous: bool
    lat: float
    lng: float
    area_type: str

@dataclass
class Resource:
    id: int
    name: str
    cost_per_hour: float
    max_units: int
    coverage_rate: float
    setup_time: float

@dataclass
class Scenario:
    name: str
    zones: List[Zone]
    resources: List[Resource]
    budget: float
    time_horizon: float
    initial_ignitions: List[int]

class FirefightingEvaluator:
    def __init__(self, scenario: Scenario):
        self.scenario = scenario
        self.num_zones = len(scenario.zones)
        self.num_resources = len(scenario.resources)
    
    def calculate_distance(self, lat1, lng1, lat2, lng2):
        R = 6371
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlng/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c
    
    def get_travel_time(self, zone_idx, resource_idx, depot_lat=36.166, depot_lng=1.333):
        zone = self.scenario.zones[zone_idx]
        resource = self.scenario.resources[resource_idx]
        distance = self.calculate_distance(depot_lat, depot_lng, zone.lat, zone.lng)
        travel_time_minutes = (distance / 40) * 60
        return max(3, travel_time_minutes + resource.setup_time)
    
    def simulate_domino_effect(self, allocation: Allocation) -> Tuple[List[float], List[List[float]], List[List[float]]]:
        num_zones = self.num_zones
        start_times = [float('inf')] * num_zones
        arrival_times = [[float('inf')] * self.num_resources for _ in range(num_zones)]
        end_times = [[0.0] * self.num_resources for _ in range(num_zones)]
        for z_idx in self.scenario.initial_ignitions:
            start_times[z_idx] = 0.0
        processed = set()
        changed = True
        while changed:
            changed = False
            for z_idx in range(num_zones):
                if start_times[z_idx] == float('inf') or z_idx in processed:
                    continue
                zone = self.scenario.zones[z_idx]
                containment_deadline = start_times[z_idx] + zone.domino_time
                total_coverage = 0.0
                for r_idx, resource in enumerate(self.scenario.resources):
                    units = allocation[z_idx][r_idx]
                    if units > 0:
                        arrival = self.get_travel_time(z_idx, r_idx)
                        arrival_times[z_idx][r_idx] = arrival
                        work_end = min(self.scenario.time_horizon, containment_deadline)
                        if arrival < work_end:
                            coverage = resource.coverage_rate * units * (work_end - arrival)
                            total_coverage += coverage
                            end_times[z_idx][r_idx] = work_end
                if total_coverage >= zone.area:
                    processed.add(z_idx)
                    changed = True
                else:
                    for neighbor in zone.neighbors:
                        if start_times[neighbor] == float('inf'):
                            start_times[neighbor] = containment_deadline
                            changed = True
                    processed.add(z_idx)
        return start_times, arrival_times, end_times
    
    def compute_cost(self, allocation: Allocation, end_times: List[List[float]], arrival_times: List[List[float]]) -> float:
        total_cost = 0.0
        for z_idx, zone in enumerate(self.scenario.zones):
            for r_idx, resource in enumerate(self.scenario.resources):
                units = allocation[z_idx][r_idx]
                if units > 0 and end_times[z_idx][r_idx] > 0:
                    duration = end_times[z_idx][r_idx] - arrival_times[z_idx][r_idx]
                    if duration > 0:
                        total_cost += resource.cost_per_hour * units * (duration / 60)
        return total_cost
    
    def compute_damage(self, allocation: Allocation, start_times: List[float]) -> float:
        total_damage = 0.0
        for z_idx, zone in enumerate(self.scenario.zones):
            if start_times[z_idx] == float('inf'): continue
            containment_deadline = start_times[z_idx] + zone.domino_time
            total_coverage = 0.0
            for r_idx, resource in enumerate(self.scenario.resources):
                units = allocation[z_idx][r_idx]
                if units > 0:
                    arrival = self.get_travel_time(z_idx, r_idx)
                    if arrival < containment_deadline:
                        total_coverage += resource.coverage_rate * units * (containment_deadline - arrival)
            total_damage += zone.risk_level * max(0, zone.area - total_coverage)
        return total_damage
    
    def evaluate(self, allocation: Allocation) -> Tuple[float, float, bool]:
        for r_idx, resource in enumerate(self.scenario.resources):
            total_r = sum(allocation[z_idx][r_idx] for z_idx in range(self.num_zones))
            if total_r > resource.max_units:
                return float('inf'), float('inf'), False
        start_times, arrival_times, end_times = self.simulate_domino_effect(allocation)
        cost = self.compute_cost(allocation, end_times, arrival_times)
        damage = self.compute_damage(allocation, start_times)
        if cost > self.scenario.budget: return cost, damage, False
        return cost, damage, True


import copy

class Wolf:
    def __init__(self, fitness, dim, minx, maxx, seed):
        rnd = random.Random(seed)
        self.position = [rnd.uniform(minx, maxx) for _ in range(dim)]
        self.fitness = fitness(self.position)

class GWO_Optimizer:
    def __init__(self, scenario: Scenario, pop_size: int = 40, max_gen: int = 60):
        self.scenario = scenario
        self.evaluator = FirefightingEvaluator(scenario)
        self.pop_size = max(5, pop_size)
        self.max_gen = max_gen
        self.num_zones = len(scenario.zones)
        self.num_resources = len(scenario.resources)
        self.dim = self.num_zones * self.num_resources
        
    def position_to_allocation(self, position):
        allocation = [[0 for _ in range(self.num_resources)] for _ in range(self.num_zones)]
        idx = 0
        raw_alloc = [[0.0 for _ in range(self.num_resources)] for _ in range(self.num_zones)]
        for z in range(self.num_zones):
            for r in range(self.num_resources):
                raw_alloc[z][r] = max(0.0, position[idx])
                idx += 1
                
        for r in range(self.num_resources):
            total_val = sum(raw_alloc[z][r] for z in range(self.num_zones))
            max_u = self.scenario.resources[r].max_units
            if total_val > 0:
                scale = max_u / total_val if total_val > max_u else 1.0
                for z in range(self.num_zones):
                    raw_alloc[z][r] *= scale
            assigned = 0
            fractional_parts = []
            for z in range(self.num_zones):
                int_val = int(raw_alloc[z][r])
                allocation[z][r] = int_val
                assigned += int_val
                fractional_parts.append((z, raw_alloc[z][r] - int_val))
            remaining = max_u - assigned
            fractional_parts.sort(key=lambda x: x[1], reverse=True)
            for z, _ in fractional_parts:
                if remaining > 0 and allocation[z][r] < max_u:
                    allocation[z][r] += 1
                    remaining -= 1
        return allocation
        
    def fitness_func(self, position):
        allocation = self.position_to_allocation(position)
        cost, damage, valid = self.evaluator.evaluate(allocation)
        penalty = 0 if valid else 1000000
        if cost > self.scenario.budget:
            penalty += (cost - self.scenario.budget) * 10
        return cost + damage * 100 + penalty

    def optimize(self):
        rnd = random.Random(0)
        n = self.pop_size
        dim = self.dim
        max_iter = self.max_gen
        
        maxx = max((r.max_units for r in self.scenario.resources), default=1)
        minx = 0
        
        wolves = sorted([Wolf(self.fitness_func, dim, minx, maxx, i) for i in range(n)], key=lambda w: w.fitness)
        if not wolves:
            return [], []
        alpha, beta, gamma = copy.copy(wolves[:3])

        for iter in range(max_iter):
            a = 2 * (1 - iter / max_iter)
            for wolf in wolves:
                A1 = a * (2 * rnd.random() - 1); C1 = 2 * rnd.random()
                A2 = a * (2 * rnd.random() - 1); C2 = 2 * rnd.random()
                A3 = a * (2 * rnd.random() - 1); C3 = 2 * rnd.random()
                
                X1 = [alpha.position[j] - A1 * abs(C1 * alpha.position[j] - wolf.position[j]) for j in range(dim)]
                X2 = [beta.position[j] - A2 * abs(C2 * beta.position[j] - wolf.position[j]) for j in range(dim)]
                X3 = [gamma.position[j] - A3 * abs(C3 * gamma.position[j] - wolf.position[j]) for j in range(dim)]
                
                Xnew = [(X1[j] + X2[j] + X3[j]) / 3 for j in range(dim)]
                Xnew = [max(minx, min(maxx, x)) for x in Xnew]
                
                fnew = self.fitness_func(Xnew)
                if fnew < wolf.fitness:
                    wolf.position, wolf.fitness = Xnew, fnew
                    
            wolves.sort(key=lambda w: w.fitness)
            alpha, beta, gamma = copy.copy(wolves[:3])
                
        top_wolves = wolves[:5]
        solutions = []
        objectives = []
        for w in top_wolves:
            alloc = self.position_to_allocation(w.position)
            c, d, _ = self.evaluator.evaluate(alloc)
            solutions.append(alloc)
            objectives.append((c, d))
            
        return solutions, objectives
