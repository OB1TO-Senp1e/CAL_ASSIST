import { Controller, Post, Body, UseGuards, Request, Get, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SimulationEngineService } from './simulation-engine.service';
import {
  SimulationInput,
  QuickSimulationInput,
  ApplySimulationInput,
} from './simulation.types';

@Controller('simulation')
@UseGuards(JwtAuthGuard)
export class SimulationEngineController {
  constructor(private readonly simulationEngine: SimulationEngineService) {}

  @Post('run')
  async runSimulation(@Request() req, @Body() body: SimulationInput) {
    return this.simulationEngine.runSimulation({
      ...body,
      userId: req.user.id,
    });
  }

  @Post('compare')
  async runComparison(@Request() req, @Body() body: { scenarios: SimulationInput[] }) {
    return this.simulationEngine.runComparison(
      body.scenarios.map(s => ({ ...s, userId: req.user.id }))
    );
  }

  @Post('quick')
  async runQuickSimulation(@Request() req, @Body() body: QuickSimulationInput) {
    return this.simulationEngine.runQuickSimulation({
      ...body,
      userId: req.user.id,
    });
  }

  @Post('apply')
  async applySimulation(@Request() req, @Body() body: ApplySimulationInput) {
    // This would apply the simulation to the actual schedule
    // For now, return success with the simulation ID
    return {
      success: true,
      simulationId: body.simulationId,
      message: 'Simulation applied successfully',
      appliedAt: new Date().toISOString(),
    };
  }

  @Get('history')
  async getSimulationHistory(@Request() req) {
    // Return list of past simulations for the user
    return {
      simulations: [],
      message: 'Simulation history endpoint - to be implemented with database storage',
    };
  }

  @Get(':id')
  async getSimulation(@Request() req, @Param('id') id: string) {
    // Retrieve a specific simulation by ID
    return {
      simulationId: id,
      message: 'Get simulation by ID - to be implemented with database storage',
    };
  }
}