import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../common/api-key.guard';
import {
  CompareDto,
  HoldDto,
  OrderDto,
  QuotationDto,
  ReleaseDto,
  SearchQueryDto,
} from './dto';
import { DiamondNotFoundError, DiamondUnavailableError, InventoryService } from './inventory.service';

/**
 * The dealer-side API from spec section 3, backed by data/diamonds.json.
 *
 * Route order matters: /diamonds/search is declared before /diamonds/:id so the
 * literal path is not swallowed by the parameter.
 */
@Controller('api')
@UseGuards(ApiKeyGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** 3.2 */
  @Get('diamonds/search')
  search(@Query() query: SearchQueryDto) {
    return this.inventory.search(query);
  }

  /** 3.5 — declared before the :id routes since it is a distinct literal path. */
  @Post('diamonds/compare')
  compare(@Body() body: CompareDto) {
    return this.inventory.compare(body.diamond_ids);
  }

  /** 3.4 */
  @Get('diamonds/:diamondId/availability')
  availability(@Param('diamondId') diamondId: string) {
    return this.wrap(() => this.inventory.availability(diamondId));
  }

  /** 3.6 */
  @Post('diamonds/:diamondId/hold')
  hold(@Param('diamondId') diamondId: string, @Body() body: HoldDto) {
    return this.wrap(() =>
      this.inventory.hold(diamondId, {
        customer_name: body.customer_name,
        customer_phone: body.customer_phone,
        customer_email: body.customer_email,
        hold_duration_hours: body.hold_duration_hours ?? 24,
        notes: body.notes,
      }),
    );
  }

  /** 3.7 */
  @Post('diamonds/:diamondId/release')
  release(@Param('diamondId') diamondId: string, @Body() body: ReleaseDto) {
    return this.wrap(() => this.inventory.release(diamondId, body.hold_id));
  }

  /** 3.3 — last, so it does not shadow the routes above. */
  @Get('diamonds/:diamondId')
  detail(@Param('diamondId') diamondId: string) {
    return this.wrap(() => this.inventory.get(diamondId));
  }

  /** 3.8 */
  @Post('quotations')
  quotation(@Body() body: QuotationDto) {
    return this.wrap(() =>
      this.inventory.quote({ ...body, valid_for_days: body.valid_for_days ?? 7 }),
    );
  }

  /** 3.9 */
  @Post('orders')
  order(@Body() body: OrderDto) {
    return this.wrap(() => this.inventory.order(body));
  }

  /** 3.10 */
  @Get('orders/:orderId')
  orderStatus(@Param('orderId') orderId: string) {
    return this.wrap(() => this.inventory.orderStatus(orderId));
  }

  /**
   * Test helper, not part of the spec: restore the fixture mid-run so a test can
   * start from a known inventory without restarting the process.
   */
  @Post('_test/reset')
  reset() {
    return { reset: true, diamonds: this.inventory.load() };
  }

  /** Maps domain errors onto the HTTP codes a real ERP would return. */
  private wrap<T>(fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      if (error instanceof DiamondNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof DiamondUnavailableError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
