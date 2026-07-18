import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClaimExecutionDto, UpdateExecutionStatusDto } from './execution.dto';
import { ExecutionService } from './execution.service';
@ApiTags('executions') @Controller('executions')
export class ExecutionController {
  constructor(private readonly service: ExecutionService) {}
  @Post('claim-next') @HttpCode(200) @ApiOperation({ summary: 'Assign the highest priority queued OS to a mechanic' }) claim(@Body() dto: ClaimExecutionDto) { return this.service.claimNext(dto.assignedTo); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Patch(':id/status') update(@Param('id') id: string, @Body() dto: UpdateExecutionStatusDto) { return this.service.updateStatus(id, dto.status, dto); }
}
