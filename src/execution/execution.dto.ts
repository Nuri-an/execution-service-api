import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ExecutionStatus } from './execution.types';
export class EnqueueExecutionDto { @ApiProperty() @IsUUID() serviceOrderId!: string; @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) priority?: number; }
export class ClaimExecutionDto { @ApiProperty() @IsString() assignedTo!: string; }
export class UpdateExecutionStatusDto { @ApiProperty({ enum: ['DIAGNOSING', 'REPAIRING', 'COMPLETED', 'CANCELLED'] }) @IsIn(['DIAGNOSING', 'REPAIRING', 'COMPLETED', 'CANCELLED']) status!: ExecutionStatus; @ApiPropertyOptional() @IsOptional() @IsString() diagnosis?: string; @ApiPropertyOptional() @IsOptional() @IsString() repairNotes?: string; }
