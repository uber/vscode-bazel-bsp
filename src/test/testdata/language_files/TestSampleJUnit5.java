package com.sample.project.common.client.samplepackage;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import com.uber.testing.base.TestBase;
import org.junit.Test;

class TestSampleJUnit5 {
  @Test
  void testCase1() {
    SampleClientProvider instance =
        SampleClientProvider.getInstance("sample");
    assertNotNull(instance);
  }

  @Test
  void testCase2() {
    SampleClientProvider instance =
        SampleClientProvider.getInstance("sample");
    StatementRenderingClient clientA = instance.getSampleClient();
    StatementRenderingClient clientB = instance.getSampleClient();
    assertNotNull(clientA);
    assertEquals(clientA, clientB);
  }
}
